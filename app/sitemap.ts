import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://moonlauncher.app";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/launch`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
