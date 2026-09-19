import type { ReachChannel } from "./types";

export const REACH_CHANNELS: ReachChannel[] = [
  { name:"web", description:"Public web pages", tier:0, hosts:[], backends:[{id:"jina-reader",description:"Jina Reader over HTTPS"},{id:"native-fetch",description:"JARVIS safe HTTPS fetch"}] },
  { name:"search", description:"Semantic web search", tier:1, backends:[{id:"exa-mcp",command:"mcporter",versionArgs:["--version"],description:"Exa via mcporter"}] },
  { name:"github", description:"GitHub repositories/code", tier:0, hosts:["github.com"], backends:[{id:"gh-cli",command:"gh",versionArgs:["--version"],description:"Official GitHub CLI"},{id:"github-rest",description:"JARVIS GitHub REST reader"}] },
  { name:"youtube", description:"YouTube video metadata/transcripts", tier:0, hosts:["youtube.com","youtu.be"], backends:[{id:"yt-dlp",command:"yt-dlp",versionArgs:["--version"],description:"yt-dlp"}] },
  { name:"rss", description:"RSS/Atom feeds", tier:0, backends:[{id:"native-rss",description:"Native bounded XML parser"}] },
  { name:"twitter", description:"Twitter/X search", tier:2, hosts:["x.com","twitter.com"], backends:[{id:"twitter-cli",command:"twitter",versionArgs:["--help"],description:"twitter-cli"},{id:"opencli",command:"opencli",versionArgs:["--version"],description:"OpenCLI browser session"}] },
  { name:"reddit", description:"Reddit search", tier:2, hosts:["reddit.com"], backends:[{id:"opencli",command:"opencli",versionArgs:["--version"],description:"OpenCLI browser session"},{id:"rdt-cli",command:"rdt",versionArgs:["--help"],description:"rdt-cli"}] },
  { name:"facebook", description:"Facebook read/search", tier:2, hosts:["facebook.com"], backends:[{id:"opencli",command:"opencli",versionArgs:["--version"],description:"OpenCLI existing browser session"}] },
  { name:"instagram", description:"Instagram read/search", tier:2, hosts:["instagram.com"], backends:[{id:"opencli",command:"opencli",versionArgs:["--version"],description:"OpenCLI existing browser session"}] },
  { name:"xiaohongshu", description:"XiaoHongShu search/read", tier:2, hosts:["xiaohongshu.com","xhslink.com"], backends:[{id:"opencli",command:"opencli",versionArgs:["--version"],description:"OpenCLI existing Chrome session"},{id:"xiaohongshu-mcp",command:"mcporter",versionArgs:["--version"],description:"MCP fallback"}] },
  { name:"bilibili", description:"Bilibili search/video", tier:0, hosts:["bilibili.com","b23.tv"], backends:[{id:"bili-cli",command:"bili",versionArgs:["--help"],description:"bili-cli"},{id:"opencli",command:"opencli",versionArgs:["--version"],description:"OpenCLI fallback"}] },
  { name:"linkedin", description:"LinkedIn public/career research", tier:2, hosts:["linkedin.com"], backends:[{id:"opencli",command:"opencli",versionArgs:["--version"],description:"OpenCLI/MCP integration"},{id:"jina-reader",description:"Public-page fallback"}] },
  { name:"boss", description:"Boss Zhipin job search via dedicated Chrome/CDP", tier:2, hosts:["zhipin.com"], backends:[{id:"boss-cli",command:"boss",versionArgs:["--help"],description:"boss-agent-cli strict existing-browser mode"}] },
  { name:"v2ex", description:"V2EX community", tier:0, hosts:["v2ex.com"], backends:[{id:"v2ex-api",description:"Public V2EX API"}] },
  { name:"xueqiu", description:"Xueqiu market/community research", tier:1, hosts:["xueqiu.com"], backends:[{id:"agent-reach",command:"agent-reach",versionArgs:["--version"],description:"Agent-Reach selected backend"}] },
  { name:"podcast", description:"Podcast/transcript research", tier:1, backends:[{id:"agent-reach",command:"agent-reach",versionArgs:["--version"],description:"Agent-Reach + transcription backend"}] },
];

export function channelByName(name: string) { return REACH_CHANNELS.find((c) => c.name === name); }
