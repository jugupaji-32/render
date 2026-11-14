(function () {
  var measurementId = "G-7NH3ES6EET";
  window.dataLayer = window.dataLayer || [];

  function gtag() {
    window.dataLayer.push(arguments);
  }

  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", measurementId);

  var script = document.createElement("script");
  script.async = true;
  script.src =
    "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
  document.head.appendChild(script);
})();
