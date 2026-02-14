exports.handler = async (event) => {
  try {
    const shopDomain = "https://shop.dnaturalbody.com";
    const cookie = event.headers.cookie || event.headers.Cookie || "";

    const res = await fetch(`${shopDomain}/cart.js`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        ...(cookie ? { "Cookie": cookie } : {})
      },
      redirect: "manual"
    });

    const text = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        ...(res.headers.get("set-cookie") ? { "Set-Cookie": res.headers.get("set-cookie") } : {}),
        "Access-Control-Allow-Origin": "*",
      },
      body: text
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
