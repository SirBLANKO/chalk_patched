# Chalk: Stored Cross-Site Scripting in Wall Posts

**Location:** The `renderMarkdown()` function in `lib/markdown.js`. The formatted post is passed through `app/page.js` to `components/PostBody.js`, which displays it on the wall.

**Problem:** The original Markdown formatter allowed HTML and JavaScript event handlers to remain in posts. Although it included a function called `escapeUnused()`, that function returned the text without making it safe to display.

**Impact:** A member could publish a post that ran JavaScript when someone viewed the wall. This could affect other members, signed-out visitors, or officers. The demonstration used here changed the page heading and displayed an alert.

**Live Demo:** [https://chalk-patched-3ug2.onrender.com](https://chalk-patched-3ug2.onrender.com)

## Steps to Reproduce

1. Run the original, unpatched application locally and open [http://localhost:3000](http://localhost:3000).
2. Sign in with `maya@campus.edu` and the password `campus123`.
3. Click **Post**, submit a normal post, and confirm that it appears on the wall.
4. Create another post containing this exact text:

   ```html
   XSS demo
   <img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
   ```

5. Click **Post to the wall**. In the vulnerable version, an alert appears saying “Chalk stored XSS,” and the main heading changes to “CHALK XSS PROOF.”
6. Refresh the page, then open the wall in an incognito window. The saved post should trigger the same behavior for that separate visitor.

**Expected behavior:** Posts should support normal Markdown formatting without running JavaScript entered by a user.

**Observed behavior before the patch:** The demonstration post changed the wall heading and displayed an alert. It also ran when the wall was opened in an incognito window, showing that the saved post could affect another visitor.

![Before patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150606.png)

![Before patch screenshot 2](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150709.png)

![Before patch screenshot 3](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150736.png)

![Before patch screenshot 4](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150747.png)

**Incognito browser showing the stored XSS:**

![Before patch incognito screenshot](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150808.png)

**Cause:** The app saved the post in SQLite and later displayed it as HTML. Because the original formatter left the image and its onerror instruction intact, the browser ran the JavaScript when the image failed to load. The problem was in how posts were displayed, rather than in saving the text itself.

## Code Examples

### Vulnerable Code Before the Patch

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

The escapeUnused() function did not actually escape or remove anything. The rest of the function added Markdown formatting but also left any HTML supplied by the author in place. It created links without checking whether their destinations were safe.

The following component then displayed that output as HTML:

**File:** `components/PostBody.js`

```javascript
"use client";

export default function PostBody({ html }) {
  return <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

Because this component treats its input as HTML, the app needs to clean the formatted post before passing it here.

### Patched Code After the Fix

From the project folder containing `package.json`, install the packages used by the patch:

```powershell
npm.cmd install --save-exact markdown-it@15.0.2 sanitize-html@2.17.7
```

Replace the contents of `lib/markdown.js` with:

```javascript
const MarkdownIt = require("markdown-it");
const sanitizeHtml = require("sanitize-html");

// Keep HTML entered in posts as plain text.
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false
});

function renderMarkdown(src) {
  const html = markdown.render(String(src ?? ""));

  // Keep only the HTML needed for supported formatting.
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

Save the changes and restart the application. Include the updated `package.json` and `package-lock.json` in the repository along with `lib/markdown.js`.

The new renderMarkdown() function uses `markdown-it` to handle formatting while keeping user-entered HTML as plain text. It then uses `sanitize-html` to allow only the formatting tags and links listed in the configuration. This keeps features such as bold text, headings, and lists while blocking executable HTML and unsafe links.

**Fix:** Replaced the original Markdown formatter with a Markdown parser and an HTML sanitizer. The cleanup happens after Markdown is converted to HTML and before the post is displayed.

**Observed behavior after the patch:** The same demonstration post appeared as plain text. It no longer opened an alert or changed the page heading, including when viewed in an incognito window. Normal Markdown formatting continued to display.

![After patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20182434.png)

**Incognito browser showing the stored XSS no longer executes:**

![After patch incognito screenshot](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20182537.png)

The original test post can remain saved in the database without executing because every post passes through the patched formatter when displayed. Deleting the test post alone would not have fixed the vulnerability.

## Exact Test Inputs

Enter each example into a post and click **Post to the wall**.

**Stored-XSS demonstration:**

```html
XSS demonstration
<img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
```

**Expected after the patch:** The HTML appears as text. No image element is created, no alert opens, and the heading stays unchanged.

**JavaScript link test:**

```markdown
[Click here](javascript:alert(1))
```

**Expected after the patch:** The post does not contain a working link that runs JavaScript.

## Hosted Testing

On the patched website hosted through Render, the demonstration post did not execute in either a regular browser window or an incognito window. The heading stayed unchanged, and the HTML appeared as text.

## Normal Functionality Checks

| Test | Result or verification status |
|---|---|
| Original XSS demonstration | Changed the heading and displayed an alert before the patch. |
| Same post after the patch | Displayed as text without an alert or heading change. |
| Hosted test in regular and incognito windows | The demonstration post did not execute. |
| Bold, italic, and headings | Passed the automated renderer checks. |
| Inline code | Passed, including code containing HTML and Markdown characters. |
| Lists and line breaks | Passed the automated renderer checks. |
| HTTPS, relative, and email links | Passed the automated renderer checks. |
| Unsafe links and executable HTML | All 13 related automated cases passed in the tested renderer. |
| Register, sign in, and sign out | Full manual check still needs to be documented. |
| Create a post and refresh the wall | Covered by the demonstration walkthrough. |
| Author or officer removes a post | Manual check still needs to be documented. |
| Member cannot access officer notes | Manual check still needs to be documented. |
| Officer can access the desk | Manual check still needs to be documented. |

## Summary

The patch fixes the identified stored-XSS issue by keeping user-entered HTML as text and cleaning the formatted output before displaying it. The demonstration post no longer executes, while supported Markdown formatting remains available.

Earlier testing included 17 automated renderer checks and a separate Chromium test comparing the original and patched output. Those checks tested the renderer rather than every feature of the application. The hosted browser checks provide additional evidence for this XSS fix, while account, permission, and post-removal checks still need to be fully documented. These results support the specific fix described here, rather than a claim that the entire application is free of vulnerabilities.
