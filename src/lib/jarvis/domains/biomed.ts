import { pubmedSearch } from "./pubmed";

type Citation={pmid:string;title:string;pubdate:string;source:string;authors:string[]};
function yearOf(s:string){const m=String(s||"").match(/(19|20)\d{2}/);return m?Number(m[0]):0;}
function evidenceHints(title:string){
  const t=title.toLowerCase();
  if(t.includes("systematic review")||t.includes("meta-analysis"))return "evidence-synthesis";
  if(t.includes("randomized")||t.includes("randomised")||t.includes("clinical trial"))return "trial";
  if(t.includes("cohort")||t.includes("case-control"))return "observational";
  if(t.includes("guideline")||t.includes("consensus"))return "guidance";
  return "other";
}
export async function biomedicalEvidenceBrief(query:string,limit=12){
  const rows=await pubmedSearch(query,limit) as Citation[];
  const currentYear=new Date().getUTCFullYear();
  const citations=rows.map(c=>({ ...c, studyHint:evidenceHints(c.title), ageYears:yearOf(c.pubdate)?currentYear-yearOf(c.pubdate):null }));
  const byType:Record<string,number>={};for(const c of citations)byType[c.studyHint]=(byType[c.studyHint]||0)+1;
  return {
    query,
    generatedAt:new Date().toISOString(),
    purpose:"research evidence discovery only; not diagnosis, prescribing, dosing, or autonomous clinical action",
    source:"PubMed/NCBI",
    count:citations.length,
    byType,
    citations,
    cautions:["Title metadata is insufficient to determine clinical validity.","Full-text methods, population, endpoints, effect sizes, harms and conflicts must be reviewed before conclusions.","Patient-specific decisions require qualified clinical review."],
  };
}
