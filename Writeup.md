# Chalk: stored cross-site scripting in wall posts

**Location:** The `renderMarkdown()` function in `lib/markdown.js`. Its output is passed from `app/page.js` to `components/PostBody.js`, which displays it using `dangerouslySetInnerHTML`.

**Problem:** User-supplied post text is converted into HTML without proper escaping or sanitization. The original `escapeUnused()` function returns the input unchanged, allowing HTML elements and JavaScript event handlers to remain in the rendered post.

**Impact:** A member can save a post containing executable HTML. When another visitor views the public wall, the injected JavaScript can run in that visitor's page, including when the visitor is signed in as an officer. The demonstration below only changes the wall heading and displays an alert.

**Live Demo:** TODO: Add the patched hosted URL.

## Steps to reproduce:

1. Run the original, unpatched application locally, and open http://localhost:3000.
3. Sign in using `maya@campus.edu` and password `campus123`.
4. Click **Post** and submit a normal post containing whatever you like. You will be able to view it on the wall.
5. Now create another post containing this exact text:

   ```html
   XSS demo
   <img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
   ```

6. Click **Post to the wall**. On the vulnerable version, the expected result is an alert saying `Chalk stored XSS` and the main heading changed to `CHALK XSS PROOF`.
7. Refresh the wall and open the same URL in a private browser window to check that the stored post triggers for a separate visitor.

**Expected behavior:** The app supports normal Markdown formatting, but text supplied in a post must not execute JavaScript in a visitor's browser.

**Observed behavior before the patch:**

![Before patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150606.png)

![Before patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150709.png)

![Before patch screenshot 2](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150736.png)

![Before patch screenshot 3](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150747.png)

**Ingognito browser showing the stored XSS:**

![Before patch screenshot 3](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150808.png)

In an isolated Chromium test, HTML produced by the original `renderMarkdown()` function created an active image element. The image's error handler changed the heading to `CHALK XSS PROOF` and displayed the `Chalk stored XSS` alert. This verifies execution at the rendering boundary. A completed manual walkthrough of the running app has not yet been documented here.

**Cause:** The post body is stored in SQLite and later passed through a Markdown formatter that preserves raw HTML. `PostBody` inserts the resulting string as HTML using `dangerouslySetInnerHTML`. The browser interprets the injected image element and executes its `onerror` attribute when the local image cannot be loaded.

The affected flow is:

`Compose form → createPostAction → posts.body → renderMarkdown → PostBody → browser`

The database insert already uses SQL placeholders. Those protect the SQL query; stored text still needs safe handling when it is rendered as HTML.

## Code Examples

### Vulnerable Code (Before Patch)

**File:** `lib/markdown.js`

```javascript
// Small markdown helper for club posts.
// Supports the handful of bits people actually type on a wall.

function escapeUnused(_src) {
  return _src;
}

function renderMarkdown(src) {
  const text = String(src ?? "");

  return escapeUnused(text)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/\n/g, "<br>");
}

module.exports = { renderMarkdown };
```

The function named `escapeUnused()` does not escape the input. The replacements add formatting tags while allowing existing HTML, such as an image with an error handler, to pass through. The link replacement also places unvalidated input into an HTML attribute.

The output is displayed by `components/PostBody.js`:

```javascript
"use client";

export default function PostBody({ html }) {
  return <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

Because this component explicitly inserts HTML, the string supplied to it must already be safe.

### Patched Code (After Fix)

From the project folder containing `package.json`, install the required packages:

```powershell
npm.cmd install --save-exact markdown-it@15.0.2 sanitize-html@2.17.7
```

```javascript
const MarkdownIt = require("markdown-it");
const sanitizeHtml = require("sanitize-html");

// Parse Markdown on the server. User-supplied HTML stays literal text.
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false
});

function renderMarkdown(src) {
  const html = markdown.render(String(src ?? ""));

  // Sanitize AFTER Markdown conversion, immediately before the HTML sink.
  // Only the elements and attributes needed for post formatting are allowed.
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "em", "code", "pre",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "hr", "a"
    ],
    allowedAttributes: {
      a: ["href", "title"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false
  });
}

module.exports = { renderMarkdown };
```

Keep the updated `package.json` and `package-lock.json` with the patched source, then restart the application.

The patched version uses `markdown-it` with `html: false`, so raw HTML entered by an author becomes literal text. It then passes the generated HTML through `sanitize-html`, allowing only the formatting elements, link attributes, and URL schemes listed in the configuration.

Sanitization occurs **after Markdown conversion** and before the result reaches `PostBody`. This preserves supported formatting while preventing active HTML elements, event handlers, and unsafe link schemes from reaching the browser as executable content.

**Fix:** Replaced the custom regex-based Markdown renderer with Markdown parsing that disables raw HTML, followed by sanitization of the generated HTML. Added the two dependencies and updated the lockfile.

**Observed behavior after the patch:**

In the isolated Chromium test, HTML produced by the patched renderer displayed the same payload as literal text. There was no active image element, no new alert, and no change to the heading. The automated formatting tests also confirmed that the supported Markdown remained available.

**Screenshots:** TODO: Add your actual after-patch and normal-Markdown screenshots, then uncomment the corresponding image lines.

<!-- ![After patch screenshot](docs/evidence/after-xss.png) -->
<!-- ![Normal Markdown after patch](docs/evidence/after-markdown.png) -->

The patch runs whenever a stored post is rendered. Existing malicious posts therefore go through the corrected renderer too; removing the demonstration post alone would not repair the underlying defect.

## Exact test inputs

Enter these in the **Post** field on the compose page. Next.js submits the form to its Server Action. These are post bodies, not URL query parameters.

**Stored-XSS demonstration:**

```html
XSS demonstration
<img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
```

Expected after patch: literal text, no active image, no alert, and no heading change.

**HTML event-handler test:**

```html
<svg onload="alert('Chalk XSS test')"></svg>
```

Expected after patch: literal text and no active SVG element.

**JavaScript link test:**

```markdown
[Click here](javascript:alert(1))
```

Expected after patch: no executable JavaScript link.

**Normal Markdown test:**

```markdown
## Markdown check

**Bold text** and *italic text* and `code`

[Wall link](/) and [University link](https://www.udel.edu)

- Calipers
- Wrench
```

Expected after patch: formatted heading, bold, italic, inline code, working relative and HTTPS links, and a two-item list.

## Hosted testing

No public deployment or hosted testing has been completed for this writeup. Add the actual hosted URL and results after checking the deployed, patched application. The local URL is reachable only from the computer running the app.

## Normal functionality checks:

The results below distinguish completed renderer tests from manual application checks that still need to be recorded.

| Test | Actual result / verification status |
|---|---|
| Original XSS payload | In isolated Chromium rendering, the handler changed the heading and opened the expected alert. |
| Same payload after the patch | In isolated Chromium rendering, the payload remained text; no image element, new alert, or heading change. |
| Bold, italic, and headings | Automated renderer tests passed. |
| Inline code | Automated test passed, including HTML and Markdown characters inside code. |
| Lists and line breaks | Automated renderer tests passed. |
| HTTPS, relative, and email links | Automated renderer tests passed. |
| Unsafe links and active HTML | All 13 active-content/link test cases passed in the patched renderer. |
| Register, sign in, and sign out | Manual app walkthrough pending. |
| Create a post and refresh the wall | Manual app walkthrough pending. |
| Author or officer takes down a post | Manual app walkthrough pending. |
| Member cannot access officer notes | Manual app walkthrough pending. |
| Officer can access the desk | Manual app walkthrough pending. |

## Summary

The identified stored-XSS defect in Chalk's post-rendering path has been patched in the supplied code. The fix disables raw HTML in Markdown and sanitizes the resulting HTML before display.

**Key improvements:**

- User-supplied HTML is rendered as text.
- Generated HTML is limited to approved formatting tags and link attributes.
- Unsafe URL schemes do not become executable links.
- Supported Markdown formatting is preserved.
- Stored posts pass through the corrected renderer whenever they are displayed.

**Verification status:**

Seventeen automated renderer tests passed. A separate Chromium test confirmed execution with the original renderer and inert output with the patched renderer. That browser test used an isolated page containing the renderer's output; it was not a complete browser walkthrough of the running Next.js application.

The supplied complete patched project also passed a production build and returned zero known dependency vulnerabilities in its audit after the separate PostCSS update. Those results apply to that complete project, not automatically to a copy that has only received the Markdown-file edit.

Manual application checks, screenshots, and hosted verification remain to be added. The available evidence supports this specific XSS fix; it does not establish that every possible vulnerability in the application has been eliminated.
