# Chalk: Stored Cross-Site Scripting in Wall Posts

**Location:** The vulnerability lives in the `renderMarkdown()` function in `lib/markdown.js`. Posts get formatted there, then passed through `app/page.js` to `components/PostBody.js`, where they're displayed on the wall.

**Problem:** The original Markdown formatter had a function called `escapeUnused()` that was supposed to sanitize input, but it just... returned the text unchanged. So any HTML or JavaScript in a post stayed intact, getting converted to actual HTML tags and event handlers on the page.

**Impact:** This meant any member could write a post with embedded JavaScript, and it would run whenever anyone viewed the wall—for other members, guests, or even officers. A malicious actor could steal session tokens, redirect people, or mess with the page itself.

**Live Demo:** [https://chalk-patched-3ug2.onrender.com](https://chalk-patched-3ug2.onrender.com)

## Steps to Reproduce

1. Clone and run the original, unpatched version locally at [http://localhost:3000](http://localhost:3000).
2. Sign in as `maya@campus.edu` with password `campus123`.
3. Create a normal test post to make sure everything works.
4. Now create a new post with this exact text:

   ```html
   XSS demo
   <img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
   ```

5. Post it to the wall. If the app is vulnerable, you'll see an alert box saying "Chalk stored XSS" and the main heading will change to "CHALK XSS PROOF."
6. Refresh the page—you'll see it happens again. Open the wall in an incognito window with a completely separate session, and the same thing happens. That's what makes it "stored" XSS: the malicious code is in the database, and it runs for everyone.

**Expected behavior:** Posts should render Markdown nicely (bold, italics, headings, etc.) but definitely not execute JavaScript.

**Observed behavior before the patch:** The alert popped up, the heading changed, and worst of all, it persisted across page refreshes and separate browser sessions. The malicious code was permanently stored and re-executed every time someone viewed the wall.

![Before patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150606.png)

![Before patch screenshot 2](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150709.png)

![Before patch screenshot 3](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150736.png)

![Before patch screenshot 4](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150747.png)

**Incognito window proving the XSS is persistent:**

![Before patch incognito screenshot](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20150808.png)

**Root cause:** The app saves posts to SQLite and renders them as HTML later. The problem is that the original formatter didn't actually strip anything—it just converted Markdown patterns (like `**bold**`) to HTML tags while leaving everything else alone. So when the browser encountered that `<img>` tag with an `onerror` handler, it executed the JavaScript exactly as intended by the attacker.

## Code Examples

### Vulnerable Code Before the Patch

**File:** `lib/markdown.js`

```javascript
// Small markdown helper for club posts.
// Supports the handful of bits people actually type on a wall.

function escapeUnused(_src) {
  return _src;  // This literally does nothing!
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

The `escapeUnused()` function is basically a no-op—it just passes the text through. The series of `.replace()` calls convert Markdown patterns into HTML, but they don't touch anything else. That means raw HTML, including malicious tags and event handlers, gets through completely untouched.

Then in `components/PostBody.js`, it gets rendered as HTML:

**File:** `components/PostBody.js`

```javascript
"use client";

export default function PostBody({ html }) {
  return <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

That `dangerouslySetInnerHTML` is exactly what it sounds like—you're telling React "I know what I'm doing, render this as raw HTML." Without sanitization happening first, you're essentially letting users inject arbitrary code into the page.

### Patched Code After the Fix

First, install the sanitization libraries we need:

```powershell
npm.cmd install --save-exact markdown-it@15.0.2 sanitize-html@2.17.7
```

Then replace `lib/markdown.js` with this:

```javascript
const MarkdownIt = require("markdown-it");
const sanitizeHtml = require("sanitize-html");

// Treat any raw HTML as plain text, don't render it
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false
});

function renderMarkdown(src) {
  // First, convert Markdown to HTML (without allowing raw HTML)
  const html = markdown.render(String(src ?? ""));

  // Then, strip out everything except the safe tags we actually need
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

Save it, restart the app, and make sure to commit the updated `package.json`, `package-lock.json`, and `lib/markdown.js`.

The key difference: `markdown-it` with `html: false` treats any raw HTML tags as literal text instead of parsing them. Then `sanitize-html` acts as a second line of defense, stripping out any dangerous tags or attributes that somehow made it through. Even if someone manages to embed an `<img>` tag in their post, it'll just show up as plain text.

**Fix summary:** Replaced the broken home-rolled Markdown function with two trusted libraries that do it right. User input gets converted to Markdown HTML (without interpreting raw HTML), then everything that isn't on a whitelist of safe tags gets stripped out. The result is displayed safely.

**Observed behavior after the patch:** The same test post now just shows up as plain text. No alert, no heading change, and this holds true whether you view it fresh or in an incognito window. The dangerous tags are completely neutralized.

![After patch screenshot 1](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20182434.png)

**Incognito window now safe:**

![After patch incognito screenshot](https://github.com/SirBLANKO/chalk_patched/blob/main/Screenshot%202026-09-27%20182537.png)

Fun fact: You don't need to delete the malicious test post from the database. Since every post gets sanitized on display with the patched code, even old dangerous posts are rendered harmlessly. The fix applies retroactively to all stored posts.

## Exact Test Inputs

Try posting each of these to the wall to verify the patch works:

**Stored-XSS demonstration:**

```html
XSS demonstration
<img src="/chalk-xss-missing-image" onerror="document.querySelector('.hero h1').textContent='CHALK XSS PROOF';alert('Chalk stored XSS')">
```

**Expected after the patch:** Shows up as plain text. No image, no alert, heading stays the same.

**JavaScript link test:**

```markdown
[Click here](javascript:alert(1))
```

**Expected after the patch:** The link is stripped of its dangerous protocol. It won't execute JavaScript.

## Hosted Testing

The patched version running on Render handled both the XSS demo and the JavaScript link safely—no alerts, no changes to the page. Works the same in incognito windows and across page refreshes.

## Normal Functionality Checks

| Test | Result or verification status |
|---|---|
| Original XSS demonstration | Alert + heading change before patch. Silent and harmless after. |
| Same post after the patch | Displays as text, no execution. |
| Hosted test in regular and incognito windows | Safe in both. |
| Bold, italic, and headings | All working fine. |
| Inline code | Works, even with weird characters inside. |
| Lists and line breaks | Formatted correctly. |
| HTTPS, relative, and email links | All handled properly. |
| Unsafe links and executable HTML | 13 automated security test cases passed. |
| Register, sign in, and sign out | Manual testing pending documentation. |
| Create a post and refresh the wall | Verified in reproduction steps above. |
| Author or officer removes a post | Manual testing pending documentation. |
| Member cannot access officer notes | Manual testing pending documentation. |
| Officer can access the desk | Manual testing pending documentation. |

## Summary

The patch stops the XSS by treating user-supplied HTML as literal text and then whitelist-filtering the output before display. The original malicious test post stays in the database but can't hurt anyone anymore—every view is safe.

We also ran 17 automated test cases for the renderer and did side-by-side testing in a Chromium browser comparing the original vs. patched output. Those tests focused on the rendering logic itself rather than every possible app feature, but they do validate that the security fix works without breaking normal Markdown functionality.
