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


function extractEpisodes(html) {
    const episodes = [];
    const videoPlayerRegex = /<video-player[^>]*anime="([^"]*)"[^>]*episodes="([^"]*)"/;
    const videoPlayerMatch = html.match(videoPlayerRegex);
      if (!videoPlayerMatch) {
        return episodes;
    }
  
    const animeJson = videoPlayerMatch[1].replace(/&quot;/g, '"');
    const animeData = JSON.parse(animeJson);
  
    const slug = animeData.slug;
    const idAnime = animeData.id;
    const episodesJson = videoPlayerMatch[2].replace(/&quot;/g, '"');
    const episodesData = JSON.parse(episodesJson);
  
      episodesData.forEach(episode => {
        episodes.push({
            href: `https://animeunity.so/anime/${idAnime}-${slug}/${episode.id}`,
            number: episode.number
        });
    });
  
      return episodes;
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
