exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const shopDomain = "https://shop.dnaturalbody.com";
    const payload = JSON.parse(event.body || "{}");

    // Forward cookies to Shopify so the cart persists for the visitor
    const cookie = event.headers.cookie || event.headers.Cookie || "";

    const res = await fetch(`${shopDomain}/cart/add.js`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(cookie ? { "Cookie": cookie } : {})
      },
      body: JSON.stringify(payload),
      redirect: "manual"
    });

    const text = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        // IMPORTANT: pass Set-Cookie back so the browser keeps the Shopify cart session
        ...(res.headers.get("set-cookie") ? { "Set-Cookie": res.headers.get("set-cookie") } : {}),
        "Access-Control-Allow-Origin": "*",
      },
      body: text
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
