import type { NextConfig } from "next";
import { withGuestbookConfig } from "./src/lib/withGuestbookConfig";

const nextConfig: NextConfig = {
  agentRules: false,
  env: {
    FLAG_COUNTER: process.env.FLAG_COUNTER,
  },
};

export default withGuestbookConfig(nextConfig);
