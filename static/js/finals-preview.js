/* Read-only presentation of the real non-finalist view. No login or API writes. */
(async () => {
  try {
    const response = await fetch("../../", {cache:"no-store"});
    if (!response.ok) throw new Error("The preview could not be loaded.");
    const source = new DOMParser().parseFromString(await response.text(), "text/html");
    const header = source.querySelector(".site-header");
    const content = source.getElementById("not-finalist");
    if (!header || !content) throw new Error("The participant view is unavailable.");
    for (const link of [...header.querySelectorAll("a"), ...content.querySelectorAll("a")]) {
      link.href = new URL(link.getAttribute("href"), response.url).href;
    }
    for (const image of header.querySelectorAll("img")) {
      image.src = new URL(image.getAttribute("src"), response.url).href;
    }
    header.querySelector("#account").hidden = false;
    header.querySelector("#identity").textContent = "Preview participant";
    const back = document.createElement("a");
    back.href = "../../"; back.className = "button button-secondary"; back.textContent = "Back";
    header.querySelector("#logout").replaceWith(back);
    content.hidden = false;
    document.querySelector("main").className = "page-shell";
    document.querySelector("main").replaceChildren(content);
    document.body.prepend(header);
    window.lucide?.createIcons();
  } catch (error) { document.getElementById("preview-status").textContent = error.message; }
})();
