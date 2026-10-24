import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Bakery Book", short_name: "Bakery", description: "Sales, baking, and stock records for a small bakery.", start_url: "/", display: "standalone", background_color: "#f8f4ed", theme_color: "#6f4933" };
}
