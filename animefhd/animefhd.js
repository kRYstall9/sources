function searchResults(html) {
  const results = [];
  const filmListRegex = /<div class="ultAnisContainerItem">[\s\S]*?<\/div>\s*<\/div>/g;
  const items = html.match(filmListRegex) || [];

  items.forEach((itemHtml) => {
      const titleMatch = itemHtml.match(/<a href="([^"]+)"[^>]*title="([^"]+)"/);
      const href = titleMatch ? titleMatch[1] : '';
      const title = titleMatch ? titleMatch[2] : '';
      const imgMatch = itemHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/);
      const imageUrl = imgMatch ? imgMatch[1] : '';

      if (title && href) {
          results.push({
              title: title.trim(),
              image: imageUrl.trim(),
              href: href.trim(),
          });
      }
  });

  console.log(results);
  return results;
}

function extractDetails(html) {
  const details = [];

  const descriptionMatch = html.match(/<b>Sinopse:<\/b>\s*<p>\s*([\s\S]*?)\s*<\/p>/);
  let description = descriptionMatch ? descriptionMatch[1].trim() : 'N/A';

  const airdateMatch = html.match(/<b>Ano:<\/b>\s*(\d{4})/);
  let airdate = airdateMatch ? airdateMatch[1].trim() : 'N/A';

  const episodesMatch = html.match(/<b>Episódios:<\/b>\s*(\d+)/);
  let aliases = episodesMatch ? episodesMatch[1].trim() : 'N/A';

  details.push({
      description: description,
      alias: "Episódios: " + aliases,
      airdate: airdate
  });

  console.log(details);
  return details;
}

function extractEpisodes(html) {
  const episodes = [];
  
  const episodeMatches = html.match(/<a href="([^"]+)"[^>]*class="list-epi"[^>]*>Episódio (\d+)<\/a>/g);
  
  if (episodeMatches) {
      episodeMatches.forEach(match => {
          const hrefMatch = match.match(/href="([^"]+)"/);
          const numberMatch = match.match(/Episódio (\d+)/);

          if (hrefMatch && numberMatch) {
              episodes.push({
                  href: hrefMatch[1],
                  number: numberMatch[1]
              });
          }
      });
  }

  console.log(JSON.stringify(episodes));
  return episodes;
}

async function extractStreamUrl(html) {
  const iframeMatch = html.match(/<iframe[^>]*src="([^"]+)"/);
  
  if (iframeMatch) {
      const streamUrl = iframeMatch[1];
      console.log(streamUrl);
      const response = await fetch(streamUrl);
      const newHtml = await response;

      const m3u8Match = newHtml.match(/file:\s*'([^']+\.m3u8)'/);

      if (m3u8Match) {
          const videoUrl = m3u8Match[1];
          console.log(videoUrl);
          return videoUrl;
      } else {
          console.log("No m3u8 URL found.");
          return null;
      }
  } else {
      console.log("No iframe found.");
      return null;
  }
}


