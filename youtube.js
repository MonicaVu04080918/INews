const youtubeKey = process.env.YOUTUBE_API_KEY
const searchTerm = "money"
let api_call_3 = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchTerm}&type=video&maxResults=3&channelId=UCeY0bbntWzzVIaj2z3QigXg&videoEmbeddable=true&key=${youtubeKey}`


export async function youtubeApi() {
  let res = await fetch(api_call_3)
  let data = await res.json();
  let dataVids = Array.from(data.items)

  let allVideos = []



  dataVids.forEach(element => {
    let video = {
      title: element.snippet.title,
      description: element.snippet.description,
      source: element.snippet.channelTitle,
      date: element.snippet.publishTime,
      thumbnail: element.snippet.thumbnails.medium.url,
      link: `https://www.youtube.com/watch?v=${element.id.videoId}`,
    }
    allVideos.push(video)

    console.log(video)
  });


}

youtubeApi()

