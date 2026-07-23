/* 访问密码门：打开页面先验证密码，验证通过才显示内容 */
(function () {
  var HASH = "5aef96240bca5582e6fd0468879a26863d81d1c1fb602def55926ef33ec8bb1f"; // sha256(密码)
  var KEY = "future_park_gate_v1";
  var root = document.documentElement;
  root.style.visibility = "hidden";

  function show() { root.style.visibility = ""; }
  function deny() {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.innerHTML =
        '<div style="text-align:center;margin-top:40vh;color:#666;font-family:sans-serif;">&#128274; 未授权访问</div>';
    });
    show();
  }
  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  if (localStorage.getItem(KEY) === "ok") { show(); return; }

  (async function () {
    for (var i = 0; i < 3; i++) {
      var input = window.prompt("此工具仅限内部团队使用，请输入访问密码：");
      if (input === null) break;
      if ((await sha256(input)) === HASH) {
        localStorage.setItem(KEY, "ok");
        show();
        return;
      }
      alert("密码错误，请重试");
    }
    deny();
  })();
})();
