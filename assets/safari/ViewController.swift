import Cocoa
import SafariServices
import WebKit

// Replaced by .github/scripts/safari-app-ui.py with the ID the build actually gives the extension.
let extensionBundleIdentifier = "__EXTENSION_BUNDLE_ID__"

// Replaces the converter's ViewController (App Review 2.1(a), 0.6.1 and 0.6.2). Differences:
// - The app stays open after opening Safari's settings: Safari does not select a disabled extension
//   (it lands on "Add Extensions"), so the steps naming what to tick must stay readable.
// - Safari may not know a freshly installed extension until it has run once: a failed attempt
//   launches Safari, retries, and finally shows the manual steps.
// - The window is made tall enough for the steps and the button (the template's clipped it).
class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.preferredContentSize = NSSize(width: 520, height: 560)

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        guard let window = view.window else { return }
        window.styleMask.insert(.resizable)
        let size = window.contentLayoutRect.size
        if size.width < 520 || size.height < 560 {
            window.setContentSize(NSSize(width: max(size.width, 520), height: max(size.height, 560)))
            window.center()
        }
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
                // The app no longer quits, so the button must not say "Quit and Open".
                webView.evaluateJavaScript("document.querySelector('button.open-preferences').innerText = 'Open Safari Settings…'")
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
                    return
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
