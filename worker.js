// 团队访问密码门：所有请求先过 Basic Auth，验证通过后才放行静态文件
// 仓库里只存密码的 SHA-256 哈希，不存明文密码
const PASSWORD_HASH = "9afebe4d68f32acee39b5f5c189921ff4db12fff26d13ed6c2427ba4335b43bc";

async function sha256hex(text) {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(data)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function unauthorized() {
  return new Response("\u9700\u8981\u5bc6\u7801\u9a8c\u8bc1\u624d\u80fd\u8bbf\u95ee", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Team Access", charset="UTF-8"' },
  });
}

export default {
  async fetch(request, env) {
    const auth = request.headers.get("Authorization") || "";
    if (auth.startsWith("Basic ")) {
      try {
        const decoded = atob(auth.slice(6));
        const password = decoded.slice(decoded.indexOf(":") + 1);
        if ((await sha256hex(password)) === PASSWORD_HASH) {
          const url = new URL(request.url);
          if (url.pathname === "/" || url.pathname === "") {
            return Response.redirect(url.origin + "/index.html", 302);
          }
          return env.ASSETS.fetch(request);
        }
      } catch (e) { /* 解析失败一律视为未授权 */ }
    }
    return unauthorized();
  },
};
