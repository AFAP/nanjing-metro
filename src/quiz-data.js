'use strict';
/*
 * Content and scoring for the line personality quiz, kept separate from the
 * rendering so scripts/test-quiz.mjs can simulate every answer combination and
 * prove that each of the 15 lines is actually reachable as an outcome.
 *
 * Every option names two or three real services, so the result is always a line
 * that the answers genuinely pointed at rather than a random pick. Ties break on
 * LINE_ORDER, which keeps the result stable for the same answers.
 */
(function (global) {
  var LINE_ORDER = ['1', '2', '3', '4', '5', '6', '7', '10', 'S1', 'S2', 'S3', 'S6', 'S7', 'S8', 'S9'];

  var QUESTIONS = [
    {
      question: '周末更想去哪儿？',
      options: [
        {label: '玄武湖边吹风，走一段明城墙', lines: ['1', '4']},
        {label: '夫子庙的夜，顺便吃点东西', lines: ['3', '5']},
        {label: '往东进山，紫金山或栖霞山', lines: ['2', '6']},
        {label: '过江去，江滩和老山那边', lines: ['10', 'S8']}
      ]
    },
    {
      question: '你更喜欢哪种节奏？',
      options: [
        {label: '老城慢慢逛，街巷里拐来拐去', lines: ['3', '7']},
        {label: '去新区看看新楼和新街', lines: ['10', 'S3']},
        {label: '郊野山水，人越少越好', lines: ['S7', 'S9']},
        {label: '机场高铁，说走就走', lines: ['S1', '6']}
      ]
    },
    {
      question: '出门的时候，你最在意什么？',
      options: [
        {label: '换乘越少越好，别折腾', lines: ['1', '2']},
        {label: '沿途有风景，路上也是行程', lines: ['S7', 'S9']},
        {label: '最好一站就到学校或图书馆', lines: ['4', '2']},
        {label: '想去没去过的地方', lines: ['6', 'S2']}
      ]
    },
    {
      question: '选一个词形容你自己',
      options: [
        {label: '踏实，日常，靠得住', lines: ['1', '7']},
        {label: '热闹，烟火气，会吃', lines: ['3', '5']},
        {label: '清静，喜欢山水和树影', lines: ['S6', 'S9']},
        {label: '爱往边界和远方跑', lines: ['S2', 'S8']}
      ]
    },
    {
      question: '一天里，你最喜欢哪一段？',
      options: [
        {label: '清晨的第一班车', lines: ['S1', 'S8']},
        {label: '午后两点的太阳', lines: ['4', 'S6']},
        {label: '傍晚江边的风', lines: ['10', 'S3']},
        {label: '深夜回程，车厢很空', lines: ['7', '5']}
      ]
    },
    {
      question: '如果有一条线路以你命名，你希望它……',
      options: [
        {label: '穿过城市最中心的地方', lines: ['1', '2']},
        {label: '一直开到另一座城市', lines: ['S2', 'S6']},
        {label: '通向湖边和山里', lines: ['S7', 'S9']},
        {label: '把机场和高铁连起来', lines: ['S1', 'S3']}
      ]
    }
  ];

  // `spotlight` names real stations on the line; `from`/`to` are filled from the
  // directory at render time so the copy cannot drift from the data.
  var PROFILES = {
    '1': {
      nickname: '城市中轴',
      why: '你大概率和 1 号线一样，是那种把一座城串起来的人。不抢眼，但少了你，很多事就接不上。',
      traits: ['稳', '在中心', '通勤熟手'],
      spotlight: ['玄武门', '鼓楼', '新街口', '南京站']
    },
    '2': {
      nickname: '东西漫游',
      why: '从河西到仙林，你习惯横着看一座城。哪边都想去看看，也哪边都待得住。',
      traits: ['好奇心', '横向思维', '爱逛'],
      spotlight: ['新街口', '大行宫', '明故宫', '马群']
    },
    '3': {
      nickname: '秦淮文韵',
      why: '你身上有老南京的味道。热闹归热闹，底色是烟火和旧事。',
      traits: ['烟火气', '念旧', '会吃'],
      spotlight: ['鸡鸣寺', '大行宫', '夫子庙', '南京站']
    },
    '4': {
      nickname: '山林与书香',
      why: '你偏爱有坡度和树影的地方，也偏爱安安静静把一件事读完。',
      traits: ['清静', '书卷气', '爱爬山'],
      spotlight: ['鼓楼', '鸡鸣寺', '九华山', '仙林湖']
    },
    '5': {
      nickname: '老城新章',
      why: '你走在老城西的街巷里，对下关、朝天宫这类地方有种说不清的亲近。',
      traits: ['市井', '念旧', '爱走老街'],
      spotlight: ['云南路', '三山街', '夫子庙', '吉印大道']
    },
    '6': {
      nickname: '栖霞入城',
      why: '新线，新视角。你愿意为了一条刚通的线路，专门跑一趟城东去看山。',
      traits: ['新鲜感', '爱探索', '行动派'],
      spotlight: ['南京南站', '明故宫', '岗子村', '栖霞山']
    },
    '7': {
      nickname: '绿意穿城',
      why: '你不追求最中心，更在意沿线的日子：社区、滨江、能真正住下去的地方。',
      traits: ['生活感', '接地气', '慢热'],
      spotlight: ['晓庄', '五塘广场', '莫愁湖', '西善桥']
    },
    '10': {
      nickname: '跨江风景',
      why: '跨江对你来说是件日常事。你习惯在两岸之间来回，也见过最多的水面。',
      traits: ['开阔', '跨江通勤', '爱看江'],
      spotlight: ['雨山路', '江心洲', '绿博园', '安德门']
    },
    'S1': {
      nickname: '奔向天空',
      why: '你的生活里总有出发：出差、赶飞机、去见很久没见的人。',
      traits: ['常在路上', '利落', '爱远行'],
      spotlight: ['南京南站', '翠屏山', '吉印大道', '禄口机场']
    },
    'S2': {
      nickname: '宁马双城',
      why: '你把两座城过成了一座城。边界对你而言，只是地图上的一笔。',
      traits: ['跨城', '重感情', '能跑'],
      spotlight: ['西善桥', '板桥', '江宁镇', '太白']
    },
    'S3': {
      nickname: '宁和跨江',
      why: '你不太走老路，愿意试试绕一点、但更顺的那一条。',
      traits: ['务实', '会规划', '有耐心'],
      spotlight: ['南京南站', '油坊桥', '永初路', '高家冲']
    },
    'S6': {
      nickname: '宁句山水',
      why: '你会为温泉、为山、为一顿饭跑一趟远门，而且觉得值。',
      traits: ['爱郊游', '会享受', '说走就走'],
      spotlight: ['马群', '麒麟门', '汤山', '句容']
    },
    'S7': {
      nickname: '宁溧郊游',
      why: '你相信真正的休息在城外：湖边、山里、人少的地方。',
      traits: ['爱清静', '爱水', '会休息'],
      spotlight: ['空港新城江宁', '溧水', '中山湖', '无想山']
    },
    'S8': {
      nickname: '宁天向北',
      why: '你一路向北也不觉得远。能吃苦，也愿意去人还不多的那一边。',
      traits: ['耐得住', '一路向北', '实在'],
      spotlight: ['泰冯路', '大厂', '六合开发区', '金牛湖']
    },
    'S9': {
      nickname: '宁高慢行',
      why: '你不赶时间。高淳老街、石臼湖边，慢一点反而到得更早。',
      traits: ['慢', '爱古镇', '不赶时间'],
      spotlight: ['翔宇路南', '石湫', '团结圩', '高淳']
    }
  };

  function score(answers) {
    var points = new Map();
    for (var i = 0; i < answers.length && i < QUESTIONS.length; i++) {
      var option = QUESTIONS[i].options[answers[i]];
      if (!option) continue;
      for (var j = 0; j < option.lines.length; j++) {
        var id = option.lines[j];
        points.set(id, (points.get(id) || 0) + 1);
      }
    }
    return points;
  }

  function rank(answers) {
    var points = score(answers);
    return Array.from(points.entries())
      .map(function (entry) { return {id: entry[0], points: entry[1]}; })
      .sort(function (a, b) {
        return b.points - a.points || LINE_ORDER.indexOf(a.id) - LINE_ORDER.indexOf(b.id);
      });
  }

  global.METRO_QUIZ = {
    lineOrder: LINE_ORDER,
    questions: QUESTIONS,
    profiles: PROFILES,
    score: score,
    rank: rank
  };
})(typeof window !== 'undefined' ? window : globalThis);
