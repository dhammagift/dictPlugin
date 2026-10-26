"""Attach an uploaded macOS build to its App Store version and send it to App Review.

Usage: asc-submit.py <version> <build-number> [--submit]
Without --submit it only prints what it finds (app, build, versions, review submissions).
Env: ASC_KEY_P8 (key contents), ASC_KEY_ID, ASC_ISSUER_ID, BUNDLE_ID.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

API = 'https://api.appstoreconnect.apple.com/v1'
EDITABLE = {'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'}

version, build_number = sys.argv[1], sys.argv[2]
submit = '--submit' in sys.argv[3:]
bundle_id = os.environ['BUNDLE_ID']


def token():
    now = int(time.time())
    return jwt.encode({'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
                      os.environ['ASC_KEY_P8'], algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})


def call(method, path, params=None, body=None):
    url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> HTTP {e.code}\n{e.read().decode()}')


app = call('GET', '/apps', {'filter[bundleId]': bundle_id})['data']
if len(app) != 1:
    sys.exit(f'expected one app for {bundle_id}, got {len(app)}')
app_id = app[0]['id']
print(f'app: {app[0]["attributes"]["name"]} ({app_id})')

builds = call('GET', '/builds', {'filter[app]': app_id, 'filter[version]': build_number,
                                 'filter[preReleaseVersion.version]': version,
                                 'filter[preReleaseVersion.platform]': 'MAC_OS'})['data']
if len(builds) != 1:
    sys.exit(f'expected one build {version} ({build_number}), got {len(builds)}')
build = builds[0]
ba = build['attributes']
print(f'build: {version} ({build_number}) processing={ba.get("processingState")} '
      f'usesNonExemptEncryption={ba.get("usesNonExemptEncryption")} expired={ba.get("expired")}')

versions = call('GET', f'/apps/{app_id}/appStoreVersions',
                {'filter[platform]': 'MAC_OS', 'limit': 20, 'include': 'build'})
for v in versions['data']:
    a = v['attributes']
    b = (v.get('relationships', {}).get('build', {}).get('data') or {}).get('id')
    print(f'  version {a["versionString"]}: appStoreState={a.get("appStoreState")} '
          f'appVersionState={a.get("appVersionState")} build={"this one" if b == build["id"] else b}')

subs = call('GET', '/reviewSubmissions', {'filter[app]': app_id, 'filter[platform]': 'MAC_OS', 'limit': 20})['data']
for s in subs:
    print(f'  review submission {s["id"]}: state={s["attributes"].get("state")} '
          f'submitted={s["attributes"].get("submittedDate")}')

if not submit:
    print('dry run: nothing changed')
    sys.exit(0)

if ba.get('processingState') != 'VALID':
    sys.exit('build is not processed yet (processingState != VALID)')
if ba.get('usesNonExemptEncryption') is None:
    sys.exit('build has no export compliance answer yet: answer it in App Store Connect (or set '
             'ITSAppUsesNonExemptEncryption in Info.plist), then run again')

target = next((v for v in versions['data'] if v['attributes']['versionString'] == version), None)
if target is None:
    target = next((v for v in versions['data'] if v['attributes'].get('appStoreState') in EDITABLE), None)
    if target is not None:
        print(f'renaming editable version {target["attributes"]["versionString"]} -> {version}')
        call('PATCH', f'/appStoreVersions/{target["id"]}',
             body={'data': {'type': 'appStoreVersions', 'id': target['id'], 'attributes': {'versionString': version}}})
    else:
        print(f'creating version {version}')
        target = call('POST', '/appStoreVersions', body={'data': {
            'type': 'appStoreVersions', 'attributes': {'platform': 'MAC_OS', 'versionString': version},
            'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}}}}})['data']
elif target['attributes'].get('appStoreState') not in EDITABLE:
    sys.exit(f'version {version} is in state {target["attributes"].get("appStoreState")}, not editable')

print(f'attaching build {build_number} to version {version}')
call('PATCH', f'/appStoreVersions/{target["id"]}/relationships/build',
     body={'data': {'type': 'builds', 'id': build['id']}})

open_sub = next((s for s in subs if s['attributes'].get('state') in ('READY_FOR_REVIEW', 'UNRESOLVED_ISSUES')), None)
if open_sub is None:
    open_sub = call('POST', '/reviewSubmissions', body={'data': {
        'type': 'reviewSubmissions', 'attributes': {'platform': 'MAC_OS'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}}}}})['data']
    print(f'created review submission {open_sub["id"]}')
items = call('GET', f'/reviewSubmissions/{open_sub["id"]}/items', {'include': 'appStoreVersion'})['data']
if not any((i.get('relationships', {}).get('appStoreVersion', {}).get('data') or {}).get('id') == target['id']
           for i in items):
    call('POST', '/reviewSubmissionItems', body={'data': {
        'type': 'reviewSubmissionItems',
        'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': open_sub['id']}},
                          'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': target['id']}}}}})
    print('added the version to the review submission')
call('PATCH', f'/reviewSubmissions/{open_sub["id"]}',
     body={'data': {'type': 'reviewSubmissions', 'id': open_sub['id'], 'attributes': {'submitted': True}}})
print(f'submitted {version} ({build_number}) for review')
