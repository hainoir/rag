import type { SourceType } from "@/lib/search/types";

export type SourceFetchMode = "api" | "rss" | "html" | "sitemap" | "manual";
export type SourceUpdateCadence = "hourly" | "daily" | "weekly" | "manual";
export type CleaningProfile = "official_notice" | "official_faq" | "community_thread";

export type SourceRegistryEntry = {
  id: string;
  name: string;
  type: SourceType;
  description: string;
  baseUrl: string;
  allowedPaths: string[];
  fetchMode: SourceFetchMode;
  updateCadence: SourceUpdateCadence;
  cleaningProfile: CleaningProfile;
  trustWeight: number;
  enabled: boolean;
};

// Replace campus.example.edu with the actual campus domains before wiring the upstream crawler.
export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    id: "library-notices",
    name: "图书馆公告与借阅规则",
    type: "official",
    description: "借阅规则、入馆说明、续借政策、自助借还公告。",
    baseUrl: "https://campus.example.edu/library",
    allowedPaths: ["/notice", "/guide", "/borrow"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 1,
    enabled: true,
  },
  {
    id: "logistics-housing",
    name: "后勤住宿与维修通知",
    type: "official",
    description: "宿舍入住、维修、热水、洗衣和门禁类通知。",
    baseUrl: "https://campus.example.edu/logistics",
    allowedPaths: ["/housing", "/repair", "/notice"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 1,
    enabled: true,
  },
  {
    id: "student-affairs-faq",
    name: "学工办事 FAQ",
    type: "official",
    description: "学工流程、报到、证件、奖助和日常办事问答。",
    baseUrl: "https://campus.example.edu/student-affairs",
    allowedPaths: ["/faq", "/service", "/guide"],
    fetchMode: "html",
    updateCadence: "weekly",
    cleaningProfile: "official_faq",
    trustWeight: 0.98,
    enabled: true,
  },
  {
    id: "club-office",
    name: "社团管理与纳新通知",
    type: "official",
    description: "社团纳新安排、百团大战日程、报名须知。",
    baseUrl: "https://campus.example.edu/clubs",
    allowedPaths: ["/notice", "/calendar", "/signup"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 0.96,
    enabled: true,
  },
  {
    id: "canteen-service",
    name: "餐饮服务中心公告",
    type: "official",
    description: "食堂营业时间、窗口分布、节假日供餐安排。",
    baseUrl: "https://campus.example.edu/canteen",
    allowedPaths: ["/hours", "/directory", "/notice"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 0.95,
    enabled: true,
  },
  {
    id: "campus-forum",
    name: "校园论坛公开帖子",
    type: "community",
    description: "公开经验帖、排队时段、避坑建议和常见问题整理。",
    baseUrl: "https://forum.campus.example.edu",
    allowedPaths: ["/thread", "/post", "/tag"],
    fetchMode: "html",
    updateCadence: "hourly",
    cleaningProfile: "community_thread",
    trustWeight: 0.72,
    enabled: true,
  },
  {
    id: "freshman-faq-board",
    name: "新生 FAQ 公共看板",
    type: "community",
    description: "新生入学公开问答和经验整理。",
    baseUrl: "https://community.campus.example.edu/freshman",
    allowedPaths: ["/faq", "/guide", "/question"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "community_thread",
    trustWeight: 0.7,
    enabled: true,
  },
  {
    id: "student-life-board",
    name: "校园生活公开讨论区",
    type: "community",
    description: "宿舍、食堂、打印店和生活服务类公开讨论。",
    baseUrl: "https://community.campus.example.edu/life",
    allowedPaths: ["/post", "/question", "/collection"],
    fetchMode: "html",
    updateCadence: "hourly",
    cleaningProfile: "community_thread",
    trustWeight: 0.68,
    enabled: true,
  },
];
