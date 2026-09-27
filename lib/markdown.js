// Small markdown helper for club posts.
// Supports the handful of bits people actually type on a wall.
const MarkdownIt = require("markdown-it");
const sanitizeHtml = require("sanitize-html");

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false
});



function renderMarkdown(src) {
  const text = md.render(String(src ?? ""));

  return sanitizeHtml(text, {
    allowedTags: ["p", "br", "strong", "em", "code", "pre",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "hr", "a"],
    allowedAttributes: {
      "a": ["href", "title"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false
  });
}

module.exports = { renderMarkdown };
