async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await fetchv2(`https://bshar1865-hianime.vercel.app/api/v2/hianime/search?q=${encodedKeyword}`);
        const data = await responseText.json();

        console.log("Search results:", data);

        const transformedResults = data.data.animes.map(anime => ({
            title: anime.name,
            image: anime.poster,
            href: `https://hianime.to/watch/${anime.id}`
        }));
        
        console.log("Transformed results:", transformedResults);
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Fetch error:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const match = url.match(/https:\/\/hianime\.to\/watch\/(.+)$/);
        const encodedID = match[1];
        const response = await fetchv2(`https://bshar1865-hianime.vercel.app/api/v2/hianime/anime/${encodedID}`);
        const data = await response.json();
        
        const animeInfo = data.data.anime.info;
        const moreInfo = data.data.anime.moreInfo;

        const transformedResults = [{
            description: animeInfo.description || 'No description available',
            aliases: `Duration: ${animeInfo.stats?.duration || 'Unknown'}`,
            airdate: `Aired: ${moreInfo?.aired || 'Unknown'}`
        }];
        
        console.log("Transformed results:", transformedResults);
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired: Unknown'
        }]);
  }
}

async function extractEpisodes(url) {
    try {
        const match = url.match(/https:\/\/hianime\.to\/watch\/(.+)$/);
        const encodedID = match[1];
        const response = await fetchv2(`https://bshar1865-hianime.vercel.app/api/v2/hianime/anime/${encodedID}/episodes`);
        const data = await response.json();

        const transformedResults = data.data.episodes.map(episode => ({
            href: `https://hianime.to/watch/${encodedID}?ep=${episode.episodeId.split('?ep=')[1]}`,
            number: episode.number
        }));
        
        console.log("Transformed results:", transformedResults);
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Fetch error:', error);
    }    
}

async function extractStreamUrl(url) {
    try {
        const match = url.match(/https:\/\/hianime\.to\/watch\/(.+)$/);
        if (!match) throw new Error("Invalid hianime URL format");
        
        const encodedID = match[1];

        console.log("Encoded ID:", encodedID);

        const streams = [];
        let subtitles = "";
        
        try {
            const dubResponse = await fetchv2(`https://bshar1865-hianime.vercel.app/api/v2/hianime/episode/sources?animeEpisodeId=${encodedID}&category=dub`);
            const dubData = await dubResponse.json();
            
            if (dubData.data && dubData.data.sources && dubData.data.sources.length > 0) {
                const dubSource = dubData.data.sources.find(source => source.type === 'hls');
                if (dubSource && dubSource.url) {
                    streams.push(dubSource.url);
                }
            }
        } catch (dubError) {
            console.log('Error fetching dub version:', dubError);
        }
        
        try {
            const subResponse = await fetchv2(`https://bshar1865-hianime.vercel.app/api/v2/hianime/episode/sources?animeEpisodeId=${encodedID}&category=sub`);
            const subData = await subResponse.json();
            
            if (subData.data && subData.data.sources && subData.data.sources.length > 0) {
                const subSource = subData.data.sources.find(source => source.type === 'hls');
                if (subSource && subSource.url) {
                    streams.push(subSource.url);
                }
                
                if (subData.data.tracks && subData.data.tracks.length > 0) {
                    const subtitleTrack = subData.data.tracks.find(track => track.label === 'English' && track.kind === 'captions');
                    if (subtitleTrack) {
                        subtitles = subtitleTrack.file;
                    }
                }
            }
        } catch (subError) {
            console.log('Error fetching sub version:', subError);
        }
        
        const result = {
            streams: streams,
            subtitles: subtitles
        };
        
        console.log("Result:", result);
        return JSON.stringify(result);
    } catch (error) {
        console.log('Fetch error in extractStreamUrl:', error);
        return JSON.stringify({
            streams: [],
            subtitles: ""
        });
    }
}

searchResults("Naruto");