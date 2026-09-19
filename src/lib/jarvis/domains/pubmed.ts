export async function pubmedSearch(query:string,limit=10){
  const n=Math.max(1,Math.min(limit,30)); const base="https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const u=new URL(`${base}/esearch.fcgi`);u.searchParams.set("db","pubmed");u.searchParams.set("term",query);u.searchParams.set("retmode","json");u.searchParams.set("retmax",String(n));
  const s=await fetch(u,{headers:{"user-agent":"Huthayfa-JARVIS/1.0"}});if(!s.ok)throw new Error(`PubMed search HTTP ${s.status}`);const sj=await s.json() as any;const ids:string[]=sj?.esearchresult?.idlist||[]; if(!ids.length)return [];
  const su=new URL(`${base}/esummary.fcgi`);su.searchParams.set("db","pubmed");su.searchParams.set("id",ids.join(","));su.searchParams.set("retmode","json"); const rr=await fetch(su);if(!rr.ok)throw new Error(`PubMed summary HTTP ${rr.status}`);const j=await rr.json() as any;
  return ids.map(id=>({pmid:id,title:j.result?.[id]?.title||"",pubdate:j.result?.[id]?.pubdate||"",source:j.result?.[id]?.source||"",authors:(j.result?.[id]?.authors||[]).slice(0,6).map((a:any)=>a.name)}));
}

function xmlText(s:string){return s.replace(/<[^>]+>/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();}
export async function pubmedFetchAbstracts(pmids:string[]){
  const ids=pmids.map(String).filter(x=>/^\d+$/.test(x)).slice(0,30); if(!ids.length)return {} as Record<string,string>;
  const u=new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");u.searchParams.set("db","pubmed");u.searchParams.set("id",ids.join(","));u.searchParams.set("retmode","xml");
  const r=await fetch(u,{headers:{"user-agent":"Huthayfa-JARVIS/1.2"}});if(!r.ok)throw new Error(`PubMed efetch HTTP ${r.status}`);const xml=await r.text();const out:Record<string,string>={};
  for(const block of xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g)||[]){const id=block.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];if(!id)continue;const abs=[...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map(m=>xmlText(m[1])).filter(Boolean).join(" ");out[id]=abs.slice(0,12000);}
  return out;
}
