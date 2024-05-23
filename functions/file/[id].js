export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  
  try {
    const upstreamResponse = await fetch('https://telegra.ph' + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });

    if (!upstreamResponse.ok) {
      throw new Error(`Upstream request failed with status ${upstreamResponse.status}`);
    }

    // 基于Referer头的逻辑
    if (request.headers.get('Referer') === url.origin + "/admin") {
      return upstreamResponse;
    }

    if (env.img_url) {
      const record = await env.img_url.getWithMetadata(params.id);
      if (record.metadata) {
        if (record.metadata.ListType === "White") {
          return upstreamResponse;
        } else if (record.metadata.ListType === "Block" || record.metadata.Label === "adult") {
          const referer = request.headers.get('Referer');
          if (!referer) {
            return Response.redirect(url.origin + "/block-img.html", 302);
          } else {
            return Response.redirect("https://static-res.pages.dev/teleimage/img-block-compressed.png", 302);
          }
        }
        if (env.WhiteList_Mode === "true") {
          return Response.redirect(url.origin + "/whitelist-on.html", 302);
        }
      }
    }

    const time = new Date().getTime();
    const apikey = env.ModerateContentApiKey;

    if (apikey) {
      const moderateResponse = await fetch(`https://api.moderatecontent.com/moderate/?key=${apikey}&url=https://telegra.ph${url.pathname}${url.search}`);
      const moderateData = await moderateResponse.json();

      if (env.img_url) {
        await env.img_url.put(params.id, "", {
          metadata: { ListType: "None", Label: moderateData.rating_label, TimeStamp: time },
        });
      }

      if (moderateData.rating_label === "adult") {
        return Response.redirect(url.origin + "/block-img.html", 302);
      }
    } else {
      if (env.img_url) {
        await env.img_url.put(params.id, "", {
          metadata: { ListType: "None", Label: "None", TimeStamp: time }
        });
      }
    }

    // 克隆 upstreamResponse 以确保无法复用读取过的流
    const newResponse = new Response(upstreamResponse.body, upstreamResponse);

    // 把上游返回的响应头转发回客户端
    newResponse.headers.set('Content-Type', upstreamResponse.headers.get('Content-Type'));
    return newResponse;

  } catch (e) {
    console.error('Request failed:', e.message);
    return new Response('Internal Server Error', { status: 500 });
  }
}
