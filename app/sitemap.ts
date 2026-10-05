import type { MetadataRoute } from "next";

const origin = "https://www.rovyncore.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: origin, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/game`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    {
      url: `${origin}/onchain-record`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${origin}/launchpad`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${origin}/rvyn`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    { url: `${origin}/transparency`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    {
      url: `${origin}/legal`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${origin}/latest-info`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
