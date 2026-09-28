# Chalk: Stored Cross-Site Scripting in Wall Posts

**Location:** The issue was in renderMarkdown() in `lib/markdown.js`. Its output passes through `app/page.js` to `components/PostBody.js`, which displays the formatted post.

**Problem:** The formatter supported Markdown, but it also let user-written HTML through unchanged. The clearest problem was escapeUnused(): despite its name, it returned the original text without escaping anything.

**Impact:** A member could save a post that ran JavaScript when another person opened the wall, including an officer. My demonstration changed the heading and displayed an alert; it did not attempt to steal information or make changes to anyone’s account.

**Live Demo:** [https://chalk-patched-3ug2.onrender.com](https://chalk-patched-3ug2.onrender.com)

## Steps to Reproduce

1. Run the original, unpatched application locally and open [http://localhost:3000](http://localhost:3000).
2. Sign in with `maya@campus.edu` and the password `campus123`.
3. Create a normal post and confirm that it appears on the wall.
4. Create another post containing this exact text:

   ```html
   XSS demo
   <img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
   ```

5. Submit the post. In the vulnerable version, an alert appears saying “Chalk stored XSS,” and the heading changes to “CHALK XSS PROOF.”
6. Refresh the wall, then open it in an incognito window. The saved post triggers the same behavior for a separate visitor.

**Expected behavior:** Posts should support Markdown formatting without running JavaScript supplied by their authors.

**Observed behavior before the patch:** The alert appeared and the heading changed. Opening the wall in an incognito window produced the same result, showing that the problem affected visitors viewing the saved post, rather than only the person who submitted it.

![Before patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150606.png)

![Before patch screenshot 2](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150709.png)

![Before patch screenshot 3](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150736.png)

![Before patch screenshot 4](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150747.png)

**Incognito window showing the stored XSS:**

![Before patch incognito screenshot](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150808.png)

**Root cause:** The formatter used text replacements to turn Markdown into HTML, which fits the app’s small set of formatting features. However, those replacements left existing HTML untouched. When the browser tried to load the missing image in my test post, its onerror handler ran the JavaScript.

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

The important detail was that escapeUnused() never changed the input. The replacements below it added formatting, but nothing removed or escaped the image tag and event handler from my test post. The link replacement also accepted destinations without checking them.

The output then reached this component:

**File:** `components/PostBody.js`

```javascript
"use client";

export default function PostBody({ html }) {
  return <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

Using dangerouslySetInnerHTML lets the generated Markdown display as formatted HTML. The mistake was passing user-controlled HTML into it without sanitizing the output first, so I focused the patch on the formatter.

### Patched Code After the Fix

From the project folder containing `package.json`, install the two packages:

```powershell
npm.cmd install --save-exact markdown-it@15.0.2 sanitize-html@2.17.7
```

Replace `lib/markdown.js` with:

```javascript
const MarkdownIt = require("markdown-it");
const sanitizeHtml = require("sanitize-html");

// Display user-entered HTML as text.
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false
});

function renderMarkdown(src) {
  const html = markdown.render(String(src ?? ""));

  // Keep the formatting and links supported by the wall.
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

Save the file and restart the app. Commit the updated `lib/markdown.js`, `package.json`, and `package-lock.json` together.

I used `markdown-it` to preserve the Markdown features while disabling raw HTML. After conversion, `sanitize-html` limits the output to the formatting tags, link attributes, and URL schemes listed above. This keeps the wall’s formatting without allowing posts to introduce executable HTML.

**Fix summary:** Replaced the custom Markdown formatter with Markdown parsing that disables raw HTML, followed by sanitization before display.

**Observed behavior after the patch:** I submitted the same test post again, and its HTML appeared as text. The alert did not open, the heading stayed unchanged, and the incognito test gave the same result.

![After patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20182434.png)

**Incognito window showing that the stored payload no longer executes:**

![After patch incognito screenshot](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20182537.png)

One useful result was that the patch also handled the test post already saved in the database. Because posts pass through renderMarkdown() whenever the wall is loaded, fixing the formatter addressed existing posts too. Deleting the demonstration post alone would only have removed that one example.

## Exact Test Inputs

Submit each example as a post to check the patched version.

**Stored-XSS demonstration:**

```html
XSS demonstration
<img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
```

**Expected after the patch:** The HTML appears as text, with no active image element, alert, or heading change.

**JavaScript link test:**

```markdown
[Click here](javascript:alert(1))
```

**Expected after the patch:** The post does not produce a clickable link that executes JavaScript.

## Hosted Testing

On the patched version hosted through Render, the XSS demonstration and JavaScript link test did not execute. Refreshing the wall and opening it in an incognito window also left the heading unchanged and produced no alerts.

## Normal Functionality Checks

| Test | Result |
|---|---|
| Original XSS demonstration | The alert appeared and the wall heading changed before the patch. |
| Same post after the patch | The HTML appeared as text. No alert appeared, and the heading stayed unchanged. |
| Hosted test in regular and incognito windows | The demonstration did not execute in either window. |
| Bold, italic, and headings | Displayed correctly in the formatting test post. |
| Inline code | Displayed as code in the formatting test post. |
| Lists and line breaks | Displayed correctly in the formatting test post. |
| JavaScript link | The hosted test did not run JavaScript when tested. |
| Register, sign in, and sign out | Signing in worked during the demonstration. Registration and sign-out worked as intended. |
| Create a post and refresh the wall | The post appeared on the wall and remained after refreshing. |
| Author or officer removes a post | Author and officer can remove posts. |
| Member cannot access officer notes | Members cannot access officer notes. |
| Officer can access the desk | Officer can access the desk. |

## Summary

The patch fixes the demonstrated stored-XSS issue while keeping normal Markdown formatting available. The same post that previously changed the page now displays as text, including when it is viewed in a separate browser session.
