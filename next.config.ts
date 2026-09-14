import type { NextConfig } from "next";
import { withGuestbookConfig } from "./src/lib/withGuestbookConfig";

const nextConfig: NextConfig = {
  agentRules: false,
};

export default withGuestbookConfig(nextConfig);
