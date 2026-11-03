import {env} from "cloudflare:workers";
export function database(){if(!env.DB)throw new Error("Calendar storage is unavailable.");return env.DB;}