import type { SearchAnswer, SearchSource } from "@/lib/search/types";

export type SearchScenario = {
  id: string;
  title: string;
  primaryQuestion: string;
  keywords: string[];
  answer: SearchAnswer;
  sources: SearchSource[];
  relatedQuestions: string[];
};

export const DEFAULT_QUESTIONS = [
  "图书馆怎么借书？",
  "新生宿舍条件怎么样？",
  "社团纳新一般在什么时候？",
  "食堂推荐哪个窗口？",
];

export const SEARCH_SCENARIOS: SearchScenario[] = [
  {
    id: "library-borrow",
    title: "图书馆借阅",
    primaryQuestion: "图书馆怎么借书？",
    keywords: ["图书馆", "借书", "借阅", "续借", "校园卡", "自助借还"],
    answer: {
      summary:
        "图书馆借书通常需要已开通权限的校园卡，支持通过自助借还机或服务台办理；普通图书默认借期为 30 天，逾期前可在线续借。",
      sourceNote:
        "结论主要来自图书馆借阅规则和新生入馆指引，社区讨论补充了高峰时段、自助借还机使用和续借失败的常见情况。",
      disclaimer:
        "考试周、寒暑假和特殊馆藏的借期可能不同，最终请以图书馆官网和馆内公告为准。",
      confidence: 0.92,
    },
    relatedQuestions: ["图书馆可以续借几次？", "忘带校园卡还能进馆吗？", "自习室怎么预约？"],
    sources: [
      {
        id: "library-rule-2026",
        title: "图书馆借阅规则（2026 春）",
        type: "official",
        publishedAt: "2026-02-18",
        snippet:
          "持有效校园卡可通过自助借还机办理借阅与归还，普通图书默认借期为 30 天，可在系统中申请续借。",
        fullSnippet:
          "图书馆借阅规则说明：持有效校园卡可通过自助借还机或服务台办理借阅与归还。普通图书默认借期为 30 天，若无他人预约且未超期，可在读者系统中申请续借。逾期将暂停部分借阅权限。",
        matchedKeywords: ["校园卡", "自助借还", "借阅", "续借"],
      },
      {
        id: "library-freshman-guide",
        title: "新生入馆指南",
        type: "official",
        publishedAt: "2026-02-05",
        snippet:
          "首次入馆前需完成新生入馆教育，借书可在一层自助借还区完成，也可前往人工服务台咨询。",
        fullSnippet:
          "新生入馆指南提醒：首次入馆前需完成线上入馆教育。借书可在一层自助借还区完成，也可前往人工服务台咨询；若校园卡异常，可先在自助终端查询读者状态。",
        matchedKeywords: ["借书", "自助借还", "校园卡"],
      },
      {
        id: "library-queue-post",
        title: "图书馆高峰期排队经验贴",
        type: "community",
        publishedAt: "2026-03-02",
        snippet:
          "工作日中午自助借还机排队较短，续借失败时先检查是否有超期或被预约，再联系服务台。",
        fullSnippet:
          "社区经验提到：工作日中午自助借还机排队较短，晚饭后人流明显增加。若续借失败，先检查是否已有超期记录或图书被他人预约，再联系服务台处理。",
        matchedKeywords: ["自助借还机", "续借", "超期"],
      },
      {
        id: "library-renew-thread",
        title: "借书续借常见问题整理",
        type: "community",
        publishedAt: "2026-03-14",
        snippet:
          "若系统提示超期或欠费，需要先处理记录后再尝试续借，部分教材和预约图书通常不能续借。",
        fullSnippet:
          "借书续借常见问题整理：若系统提示超期或欠费，需要先处理对应记录后再尝试续借。部分教材、预约图书和短借资源通常不能续借，建议优先查看馆藏状态说明。",
        matchedKeywords: ["续借", "超期", "教材"],
      },
    ],
  },
  {
    id: "freshman-dorm",
    title: "新生宿舍",
    primaryQuestion: "新生宿舍条件怎么样？",
    keywords: ["宿舍", "新生", "住宿", "条件", "床位", "空调", "热水"],
    answer: {
      summary:
        "新生宿舍一般按学院或校区统一分配，常见基础配置包括床位、书桌、衣柜、空调和独立储物空间；具体是上床下桌还是多床位布局，需要以当年分配通知为准。",
      sourceNote:
        "官方住宿须知给出了入住流程与基础配置说明，社区内容补充了热水、洗衣和公共空间的日常体验。",
      disclaimer:
        "不同楼栋和校区差异较大，若问题涉及楼栋、热水时段或电费标准，请优先查看最新宿舍管理通知。",
      confidence: 0.87,
    },
    relatedQuestions: ["宿舍晚上几点门禁？", "新生什么时候能查到宿舍分配？", "宿舍洗衣怎么收费？"],
    sources: [
      {
        id: "dorm-checkin-guide",
        title: "新生住宿入住须知",
        type: "official",
        publishedAt: "2026-01-26",
        snippet:
          "入住时需完成报到、领取宿舍钥匙并核验校园卡信息，宿舍基础设施包含床位、书桌、衣柜与空调。",
        fullSnippet:
          "新生住宿入住须知：学生报到后需完成宿舍登记、领取钥匙并核验校园卡信息。宿舍基础设施通常包含床位、书桌、衣柜、空调和公共晾晒区域，具体配置以校区和楼栋为准。",
        matchedKeywords: ["宿舍", "床位", "空调", "校园卡"],
      },
      {
        id: "dorm-faq",
        title: "后勤住宿 FAQ",
        type: "official",
        publishedAt: "2026-02-03",
        snippet:
          "新生宿舍由学校统一分配，热水、空调和洗衣服务以楼栋实际配置为准，部分楼栋支持线上报修。",
        fullSnippet:
          "后勤住宿 FAQ 说明：新生宿舍由学校统一分配，热水、空调和洗衣服务以楼栋实际配置为准。若设施异常，可通过后勤平台发起线上报修，维修进度会同步到个人中心。",
        matchedKeywords: ["统一分配", "热水", "洗衣", "报修"],
      },
      {
        id: "dorm-life-thread",
        title: "宿舍生活体验整理",
        type: "community",
        publishedAt: "2026-03-11",
        snippet:
          "多数新生楼栋为四人间，收纳空间够用，但建议自备床帘、插线板和小型桌面收纳。",
        fullSnippet:
          "宿舍生活体验整理：多数新生楼栋为四人间，收纳空间基本够用，但建议自备床帘、插线板和小型桌面收纳。楼层公共区域通常在晚间更热闹，洗衣高峰集中在周末。",
        matchedKeywords: ["四人间", "收纳", "插线板"],
      },
      {
        id: "dorm-hotwater-post",
        title: "热水与洗衣使用经验",
        type: "community",
        publishedAt: "2026-03-19",
        snippet:
          "热水供应和洗衣高峰会随楼栋不同而变化，晚饭后常是排队高峰，提前错峰更方便。",
        fullSnippet:
          "社区讨论提到：热水供应和洗衣高峰会随楼栋不同而变化，晚饭后常是排队高峰，建议提前准备洗衣袋和储物篮；若遇到热水不稳定，优先查看宿舍群通知。",
        matchedKeywords: ["热水", "洗衣", "高峰"],
      },
    ],
  },
  {
    id: "club-recruitment",
    title: "社团纳新",
    primaryQuestion: "社团纳新一般在什么时候？",
    keywords: ["社团", "纳新", "报名", "百团大战", "申请", "面试"],
    answer: {
      summary:
        "社团纳新通常集中在开学后 2 到 4 周，信息发布以校团委公告、学院群和线下招新摊位为主；部分社团需要线上报名和简单面试。",
      sourceNote:
        "官方来源给出了纳新时间窗口和活动安排，社区内容补充了面试流程、报名节奏与新生常见踩坑。",
      disclaimer:
        "不同社团的招新方式差异很大，涉及具体时间和要求时，应以该社团最新公告为准。",
      confidence: 0.89,
    },
    relatedQuestions: ["百团大战通常办几天？", "社团面试会问什么？", "一个人能报名几个社团？"],
    sources: [
      {
        id: "club-official-calendar",
        title: "校团委社团活动日程",
        type: "official",
        publishedAt: "2026-02-28",
        snippet:
          "学生社团集中展示与纳新安排在开学初进行，活动信息会同步发布在校团委平台和线下宣传点位。",
        fullSnippet:
          "校团委社团活动日程显示：学生社团集中展示与纳新安排在开学初进行，相关信息会同步发布在校团委平台、学院通知群与线下宣传点位。部分社团需提前预约宣讲或报名。",
        matchedKeywords: ["社团", "纳新", "活动日程"],
      },
      {
        id: "club-registration-guide",
        title: "学生社团报名说明",
        type: "official",
        publishedAt: "2026-03-04",
        snippet:
          "社团报名通常包含线上登记、线下宣讲和面试确认三个环节，具体以社团报名表为准。",
        fullSnippet:
          "学生社团报名说明：社团报名通常包含线上登记、线下宣讲和面试确认三个环节，具体流程以社团报名表为准。若社团有作品集、试讲或基础技能要求，会在报名页注明。",
        matchedKeywords: ["报名", "面试", "社团"],
      },
      {
        id: "club-fair-post",
        title: "百团大战路线建议",
        type: "community",
        publishedAt: "2026-03-08",
        snippet:
          "热门社团在第一天下午最拥挤，建议先记下感兴趣社团，再集中补报名和咨询面试要求。",
        fullSnippet:
          "社区经验提到：热门社团在第一天下午最拥挤，建议先记下感兴趣社团，再集中补报名和咨询面试要求。如果时间有限，可以优先看和自身技能匹配度高的社团。",
        matchedKeywords: ["百团大战", "报名", "面试"],
      },
      {
        id: "club-interview-thread",
        title: "新生社团面试经验",
        type: "community",
        publishedAt: "2026-03-15",
        snippet:
          "多数社团面试关注时间投入、兴趣和基本沟通能力，技术类社团可能会问作品或基础能力。",
        fullSnippet:
          "新生社团面试经验：多数社团面试会关注时间投入、兴趣和基本沟通能力，技术类社团可能会要求展示作品或问基础能力。提前了解社团最近活动，会让回答更具体。",
        matchedKeywords: ["面试", "作品", "时间投入"],
      },
    ],
  },
  {
    id: "cafeteria-guide",
    title: "食堂推荐",
    primaryQuestion: "食堂推荐哪个窗口？",
    keywords: ["食堂", "推荐", "窗口", "营业时间", "早餐", "晚餐", "饭堂"],
    answer: {
      summary:
        "食堂窗口的选择更适合按校区和时段判断：早餐优先靠近宿舍的基础窗口，午晚餐热门档口排队长，先看官方营业时间再结合社区口碑更稳妥。",
      sourceNote:
        "官方来源提供了营业时间和窗口分布，社区讨论补充了热门档口、排队节奏与适合错峰的时间段。",
      disclaimer:
        "窗口会随学期、装修和人流做调整，如果涉及具体档口是否营业，请以食堂现场和后勤通知为准。",
      confidence: 0.84,
    },
    relatedQuestions: ["早餐哪个窗口排队最短？", "晚饭高峰大概几点？", "校内有没有夜宵窗口？"],
    sources: [
      {
        id: "canteen-hours",
        title: "饮食服务中心营业时间",
        type: "official",
        publishedAt: "2026-02-16",
        snippet:
          "各校区食堂营业时间分为早餐、午餐、晚餐与夜宵时段，部分窗口在周末调整营业安排。",
        fullSnippet:
          "饮食服务中心营业时间说明：各校区食堂营业时间分为早餐、午餐、晚餐与夜宵时段，部分窗口在周末调整营业安排。若遇到考试周或节假日，后勤会另行发布开放窗口名单。",
        matchedKeywords: ["营业时间", "早餐", "晚餐", "夜宵"],
      },
      {
        id: "canteen-directory",
        title: "食堂窗口与楼层分布",
        type: "official",
        publishedAt: "2026-02-21",
        snippet:
          "学校公布了主要食堂楼层分布、窗口类型和支付方式，支持按校区查看常见窗口位置。",
        fullSnippet:
          "食堂窗口与楼层分布：学校公布了主要食堂楼层分布、窗口类型和支付方式，支持按校区查看常见窗口位置。部分窗口会在晚餐后调整为夜宵模式，建议先查看楼层导览。",
        matchedKeywords: ["食堂", "窗口", "支付方式"],
      },
      {
        id: "canteen-ranking-post",
        title: "校内食堂口碑整理",
        type: "community",
        publishedAt: "2026-03-06",
        snippet:
          "社区普遍认为早餐窗口要看离宿舍的距离，午晚餐则更看翻台速度和排队是否顺畅。",
        fullSnippet:
          "校内食堂口碑整理：社区普遍认为早餐窗口要看离宿舍的距离，午晚餐则更看翻台速度和排队是否顺畅。若想节省时间，建议先避开整点和下课后 20 分钟内的高峰。",
        matchedKeywords: ["早餐", "排队", "翻台速度"],
      },
      {
        id: "canteen-tips-thread",
        title: "窗口错峰就餐经验",
        type: "community",
        publishedAt: "2026-03-18",
        snippet:
          "如果只想快吃，优先选套餐固定、出餐稳定的窗口；热门档口通常在 18 点前后最拥挤。",
        fullSnippet:
          "窗口错峰就餐经验：如果只想快吃，优先选套餐固定、出餐稳定的窗口；热门档口通常在 18 点前后最拥挤。若要堂食，建议避开社团活动结束后的集中就餐时间。",
        matchedKeywords: ["窗口", "出餐", "高峰"],
      },
    ],
  },
  {
    id: "campus-card",
    title: "校园卡补办",
    primaryQuestion: "校园卡丢了怎么补办？",
    keywords: ["校园卡", "补办", "挂失", "丢失", "临时卡"],
    answer: {
      summary:
        "校园卡丢失后应先在线挂失，再前往校园卡服务点补办；部分学校支持临时卡或电子码作为过渡方案。",
      sourceNote:
        "官方补办流程说明了挂失、补卡和领卡步骤，社区内容补充了排队时间和现场办理节奏。",
      disclaimer:
        "补办费用、领卡时间和临时卡政策可能变化，最终请以校园卡中心当期通知为准。",
      confidence: 0.9,
    },
    relatedQuestions: ["挂失后还能刷门禁吗？", "补卡一般多久能拿到？", "可以代办校园卡吗？"],
    sources: [
      {
        id: "card-loss-guide",
        title: "校园卡挂失与补办流程",
        type: "official",
        publishedAt: "2026-02-12",
        snippet:
          "校园卡丢失后需先通过服务平台挂失，再携带证件到校园卡中心补办，部分校区支持电子码过渡。",
        fullSnippet:
          "校园卡挂失与补办流程：校园卡丢失后需先通过服务平台挂失，再携带有效证件到校园卡中心补办。部分校区支持电子码作为过渡方案，补办完成后原卡自动失效。",
        matchedKeywords: ["挂失", "补办", "电子码"],
      },
      {
        id: "card-temp-guide",
        title: "临时卡使用说明",
        type: "official",
        publishedAt: "2026-02-24",
        snippet:
          "因校园卡丢失或损坏影响通行时，可按说明申请临时卡或临时门禁权限。",
        fullSnippet:
          "临时卡使用说明：因校园卡丢失或损坏影响通行时，可按说明申请临时卡或临时门禁权限。临时权限通常用于就餐、门禁和图书馆等基础场景，具体范围以系统设置为准。",
        matchedKeywords: ["临时卡", "门禁", "校园卡"],
      },
      {
        id: "card-queue-post",
        title: "补卡排队经验整理",
        type: "community",
        publishedAt: "2026-03-10",
        snippet:
          "中午和开学初是补卡高峰，建议先线上挂失并准备好证件，可以减少现场等待时间。",
        fullSnippet:
          "补卡排队经验整理：中午和开学初是补卡高峰，建议先线上挂失并准备好证件，可以减少现场等待时间。部分服务点午休时间较长，出发前最好先确认开放时段。",
        matchedKeywords: ["补卡", "挂失", "证件"],
      },
    ],
  },
];

