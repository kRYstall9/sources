async function searchResults(keyword) {
  const response = await fetchv2(
    `https://www.animeunity.so/archivio?title=${keyword}`
  );
  const html = await response.text();

  const regex = /<archivio[^>]*records="([^"]*)"/;
  const match = regex.exec(html);

  if (!match || !match[1]) {
    return { results: [] };
  }

  const items = JSON.parse(match[1].replaceAll(`&quot;`, `"`));

  const results =
    items.map((item) => ({
      title: item.title ?? item.title_eng,
      image: item.imageurl,
      href: `https://www.animeunity.so/info_api/${item.id}`,
    })) || [];

  return JSON.stringify(results);
}

async function extractDetails(url) {
  const response = await fetchv2(url);
  const json = JSON.parse(await response.text());

  return JSON.stringify([
    {
      description: json.plot,
      aliases: "N/A",
      airdate: json.date,
    },
  ]);
}

async function extractEpisodes(url, page = 1) {
  const episodesPerPage = 120;
  const lastPageEpisode = page * episodesPerPage;
  const firstPageEpisode = lastPageEpisode - (episodesPerPage - 1);
  const uurl = `${url}/1?start_range=${firstPageEpisode}&end_range=${lastPageEpisode}`;

  const response = await fetchv2(uurl);
  const json = JSON.parse(await response.text());

  const response2 = await fetchv2(url);
  const json2 = JSON.parse(await response2.text());

  const results =
    json.episodes.map((e) => ({
      href: `https://www.animeunity.so/anime/${json2.id}-${json2.slug}/${e.id}`,
      number: e.number,
    })) || [];

  return JSON.stringify(results);
}

async function extractStreamUrl(url) {
  const response = await fetchv2(url);
  const html = await response.text();

  const regex = /<video-player[^>]*embed_url="([^"]+)"/;
  const match = regex.exec(html);
  const embedUrl = match ? match[1].replaceAll(`&amp;`, "&") : "";

  if (embedUrl) {
    const response = await fetchv2(embedUrl);
    const html = await response.text();

    const scriptRegex =
      /<script[^>]*>([\s\S]*?window\.video[\s\S]*?)<\/script>/;
    const scriptMatch = scriptRegex.exec(html);
    const scriptContent = scriptMatch ? scriptMatch[1] : "";

    const domain = /url: '([^']+)'/.exec(scriptContent)[1];
    const token = /token': '([^']+)'/.exec(scriptContent)[1];
    const expires = /expires': '([^']+)'/.exec(scriptContent)[1];

    let streamUrl = new URL(domain);

    streamUrl.searchParams.append("token", token);
    streamUrl.searchParams.append("referer", "");
    streamUrl.searchParams.append("expires", expires);
    streamUrl.searchParams.append("h", "1");

    return streamUrl.href;
  }

  return null;
}
