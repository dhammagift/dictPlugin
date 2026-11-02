import Cocoa
import SafariServices
import WebKit

// Replaced by .github/scripts/safari-app-ui.py with the ID the build actually gives the extension.
let extensionBundleIdentifier = "__EXTENSION_BUNDLE_ID__"

// Replaces the converter's ViewController. Safari may not know a freshly installed extension until
// Safari itself has run once: until then getStateOfSafariExtension and showPreferencesForExtension
// fail, and the template's button just quit the app (App Review 2.1(a), 0.6.1 and 0.6.2). Here a
// failed attempt launches Safari, retries, and if Safari still can't show the pane the window stays
// open with the manual steps instead of disappearing.
class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            DispatchQueue.main.async {
                if let state = state, error == nil {
                    webView.evaluateJavaScript("show(\(state.isEnabled), true)")
                } else {
                    // Unknown state still gets the current wording ("Safari Settings").
                    webView.evaluateJavaScript("show(undefined, true)")
                }
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if (message.body as? String != "open-preferences") {
            return
        }
        openExtensionSettings(attempt: 0)
    }

    private func openExtensionSettings(attempt: Int) {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                if error == nil {
                    NSApplication.shared.terminate(nil)
                } else if attempt == 0 {
                    self.launchSafari { self.retry(attempt: 1) }
                } else if attempt < 6 {
                    self.retry(attempt: attempt + 1)
                } else {
                    self.showManualSteps()
                }
            }
        }
    }

    private func retry(attempt: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            self.openExtensionSettings(attempt: attempt)
        }
    }

    private func launchSafari(then next: @escaping () -> Void) {
        guard let safari = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") else {
            next()
            return
        }
        if #available(macOS 10.15, *) {
            NSWorkspace.shared.openApplication(at: safari, configuration: NSWorkspace.OpenConfiguration()) { _, _ in
                DispatchQueue.main.async { next() }
            }
        } else {
            _ = try? NSWorkspace.shared.launchApplication(at: safari, options: [], configuration: [:])
            next()
        }
    }

    private func showManualSteps() {
        let text = "Safari is open: choose Safari > Settings > Extensions, turn on Dhamma.gift, then allow it on all websites."
        webView.evaluateJavaScript("document.querySelectorAll('p').forEach(function(p){p.style.display='none'});"
            + "var n=document.createElement('p');n.textContent=\(String(reflecting: text));"
            + "document.body.insertBefore(n,document.querySelector('ol')||document.querySelector('button'));")
    }

}
