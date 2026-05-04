import type { SourceType } from "./types";

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

export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    id: "tjcu-main-notices",
    name: "天津商业大学主站",
    type: "official",
    description: "学校通知公告、校历、校园新闻和面向全校公开的办事信息。",
    baseUrl: "https://www.tjcu.edu.cn/",
    allowedPaths: ["/info", "/index"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 1.0,
    enabled: true,
  },
  {
    id: "tjcu-info-disclosure",
    name: "天津商业大学信息公开网",
    type: "official",
    description: "信息公开目录、公开事项、预算决算和依申请公开相关页面。",
    baseUrl: "https://xxgk.tjcu.edu.cn/",
    allowedPaths: ["/info", "/xxgkml", "/xxgkzn"],
    fetchMode: "html",
    updateCadence: "weekly",
    cleaningProfile: "official_notice",
    trustWeight: 0.99,
    enabled: true,
  },
  {
    id: "tjcu-undergrad-admissions",
    name: "天津商业大学本科招生网",
    type: "official",
    description: "本科招生章程、报考问答、专业介绍和录取相关公开信息。",
    baseUrl: "https://zs.tjcu.edu.cn/",
    allowedPaths: ["/info", "/index/kswd", "/index"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 0.99,
    enabled: true,
  },
  {
    id: "tjcu-grad-admissions",
    name: "天津商业大学研究生招生网",
    type: "official",
    description: "硕士招生简章、专业目录、调剂公告和入学须知等研招信息。",
    baseUrl: "https://yz.tjcu.edu.cn/",
    allowedPaths: ["/info"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 0.99,
    enabled: true,
  },
  {
    id: "tjcu-library",
    name: "天津商业大学图书馆",
    type: "official",
    description: "开馆时间、借阅与预约指南、FAQ 和馆内通知公告。",
    baseUrl: "https://lib.tjcu.edu.cn/",
    allowedPaths: ["/info", "/gk"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_faq",
    trustWeight: 0.95,
    enabled: true,
  },
  {
    id: "tjcu-student-affairs",
    name: "天津商业大学学工部 / 学生处",
    type: "official",
    description: "奖助、公寓、请假、征兵和学生日常管理服务信息。",
    baseUrl: "https://xgb.tjcu.edu.cn/",
    allowedPaths: ["/info", "/bmjs", "/index"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_faq",
    trustWeight: 0.97,
    enabled: true,
  },
  {
    id: "tjcu-career",
    name: "天津商业大学就业信息网",
    type: "official",
    description: "就业通知、招聘日历、双选会和毕业手续公开说明。",
    baseUrl: "https://career.tjcu.edu.cn/",
    allowedPaths: ["/news", "/reccalender", "/correcruit"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 0.96,
    enabled: true,
  },
  {
    id: "tjcu-academic-affairs",
    name: "天津商业大学教务处",
    type: "official",
    description: "教学通知、学生业务、规章制度和教学流程说明。",
    baseUrl: "https://jwc.tjcu.edu.cn/",
    allowedPaths: ["/info", "/index"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_faq",
    trustWeight: 0.97,
    enabled: true,
  },
  {
    id: "tjcu-logistics",
    name: "天津商业大学后勤处",
    type: "official",
    description: "食堂、宿舍维修、供暖、校园外卖和后勤服务通知。",
    baseUrl: "https://hqglc.tjcu.edu.cn/",
    allowedPaths: ["/info"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "official_notice",
    trustWeight: 0.94,
    enabled: true,
  },
  {
    id: "tjcu-tieba",
    name: "天津商业大学吧",
    type: "community",
    description: "公开经验帖、宿舍与校园生活讨论，作为经验补充而非最终依据。",
    baseUrl: "https://tieba.baidu.com/f?kw=%E5%A4%A9%E6%B4%A5%E5%95%86%E4%B8%9A%E5%A4%A7%E5%AD%A6",
    allowedPaths: ["/f", "/p"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "community_thread",
    trustWeight: 0.62,
    enabled: true,
  },
  {
    id: "tjcu-zhihu",
    name: "知乎天津商业大学检索入口",
    type: "community",
    description: "知乎公开问答检索入口，用于补充择校、专业和校园体验类讨论。",
    baseUrl: "https://www.zhihu.com/search?type=content&q=%E5%A4%A9%E6%B4%A5%E5%95%86%E4%B8%9A%E5%A4%A7%E5%AD%A6",
    allowedPaths: ["/search", "/question"],
    fetchMode: "html",
    updateCadence: "daily",
    cleaningProfile: "community_thread",
    trustWeight: 0.58,
    enabled: true,
  },
];
