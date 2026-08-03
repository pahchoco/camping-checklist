// Admin-managed category tree. Edit this file and redeploy to change the
// 대분류/중분류/소분류 structure — there is no in-app UI for it (see app.js).
//
// Each subcategory's saved items are keyed by "대분류›중분류›소분류" (see
// buildStateFromConfig in app.js), so renaming an entry here orphans any
// items users had already added under the old name. Reordering or adding
// entries is safe.
const CATEGORY_CONFIG = [
  {
    name: '텐트/쉘터',
    mids: [
      { name: '텐트', subs: ['메인 텐트', '이너 텐트'] },
      { name: '타프·쉘터', subs: ['타프', '쉘터'] },
      { name: '텐트 부속', subs: ['폴대', '팩', '가이로프'] },
    ],
  },
  {
    name: '침구/수면',
    mids: [
      { name: '침대', subs: ['에어매트', '자충매트', '야전침대'] },
      { name: '침낭·침구', subs: ['침낭', '베개·담요'] },
    ],
  },
  {
    name: '취사',
    mids: [
      { name: '조리도구', subs: ['버너(스토브)', '코펠·식기'] },
      { name: '취사소품', subs: ['그릴', '커트러리·도마'] },
      { name: '식재료 보관', subs: ['아이스박스', '워터저그'] },
    ],
  },
  {
    name: '가구/조명',
    mids: [
      { name: '테이블·의자', subs: ['테이블', '의자'] },
      { name: '조명', subs: ['랜턴', '헤드랜턴·무드등'] },
    ],
  },
  {
    name: '화로/난방',
    mids: [
      { name: '화로', subs: ['화로대', '장작·착화 용품'] },
      { name: '난방기구', subs: ['캠핑난로', '핫팩·온수매트'] },
    ],
  },
  {
    name: '수납/운반',
    mids: [
      { name: '수납함', subs: ['수납박스', '정리함(트렁크용)'] },
      { name: '운반도구', subs: ['웨건(카트)', '백팩·가방'] },
    ],
  },
  {
    name: '차량/오토캠핑',
    mids: [
      { name: '차박·루프탑', subs: ['루프탑텐트', '차박매트'] },
      { name: '적재·거치', subs: ['루프박스', '차량용 어닝'] },
    ],
  },
  {
    name: '소품/데코',
    mids: [
      { name: '감성소품', subs: ['디퓨저·데코소품', '스트링라이트'] },
      { name: '안전·기타', subs: ['소화기', '벌레퇴치용품'] },
    ],
  },
];
