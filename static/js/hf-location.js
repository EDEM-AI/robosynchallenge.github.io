(function () {
  "use strict";
  window.normalizeHfLocation = function (value) {
    let text = String(value || "").trim();
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text)) text = "https://huggingface.co/" + text;
    const url = new URL(text);
    const match = text.match(/^https:\/\/huggingface\.co\/([^?#\s\\]+)\/?$/i);
    const parts = match ? match[1].replace(/\/$/, "").split("/").map(decodeURIComponent) : [];
    if (url.protocol !== "https:" || url.host !== "huggingface.co" || url.username || url.password || url.search || url.hash ||
        parts.length < 2 || parts.slice(0, 2).some(part => !/^[A-Za-z0-9_.-]+$/.test(part)) ||
        parts.some(part => !part || part === "." || part === ".." || /[\s\\]/.test(part)) ||
        (parts.length > 2 && (parts.length < 4 || !["tree", "blob", "resolve"].includes(parts[2])))) {
      throw new Error("Use a Hugging Face URL or account/repository; preserve the documented revision and subdirectory.");
    }
    return url.href.replace(/\/$/, "");
  };
})();
