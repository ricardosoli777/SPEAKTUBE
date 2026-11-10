const run = () => {
  document.querySelectorAll("section span").forEach((elm) => {
    const addListener = (elm, type) => {
      elm.addEventListener(type, ({target}) => {
        navigator.clipboard.writeText(target.textContent);
        //console.log("text write to clipboard", target.textContent);
      });
    };
    addListener(elm, "click");
    addListener(elm, "contextmenu");
  });
};

(() => {
  document.addEventListener("DOMContentLoaded", () => {
    run();
  });
})();
