/**
 * 把结构 JSON 转成画布元素/连线。
 *
 * - 节点：pendant.node 保存完整结构节点；
 * - 第一个节点：pendant.meta 保存 meta；
 * - 主链：edges 中从 start 出发的链；
 * - 循环体/分支体：edge=false 的视觉连线。
 */
const familyId = 'com.horsecoder.agent';

const LABELS: Record<string, string> = {
  fetch: '读取数据',
  fetch_tasks: '读取任务（SOQL）',
  fetch_accounts: '读取账户',
  fetch_notes: '读取备注',
  fetch_orders: '读取订单',
  fetch_optout: '读取 opt-out',
  rows: '转成对象',
  rows_orders: '订单转对象',
  rows_optout: 'opt-out 转对象',
  pick: '过滤',
  ext_notes: '过滤 extension',
  join_acc: '关联账户名',
  join_ext: '标记豁免',
  join_optout: '标记 opt-out',
  loop1: '循环',
  days: '计算日期差',
  route: '条件分支',
  tag_route: '标签分支',
  value_route: '高价值分支',
  flag: '建 OVERDUE 任务',
  collect: '记录到 state',
  meeting: '创建 Zoom',
  registrant: '注册参会人',
  status: '更新状态',
  slack: 'Slack 通知',
  notion: '创建 Notion 页面',
  encode: '编码邮件',
  enc_yes: '编码确认信',
  enc_dir: '编码上报信',
  enc_pend: '编码待办信',
  enc_exp: '编码过期信',
  enc_warn: '编码提醒信',
  enc_sum: '编码汇总信',
  enc_std: '编码标准信',
  send: '发送邮件',
  send_yes: '发送确认信',
  send_dir: '发送上报信',
  send_pend: '发送待办信',
  send_exp: '发送过期信',
  send_warn: '发送提醒信',
  send_sum: '发送汇总信',
  send_std: '发送标准信',
  invoice: '创建发票',
  create: '创建 item',
  add_member: '加入 Mailchimp',
  tag_new: '打新客标签',
  tag_repeat: '打复购标签',
  tag_vip: '打 VIP 标签',
  tag_high: '打高价值标签',
};

const labelOf = (node: any) => LABELS[node.id] || node.id;

const nodeState = (id: string, name: string, x: number, y: number, node: any) => ({
  id,
  name,
  type: 'model',
  color: '#5cdbd3',
  x,
  y,
  select: false,
  locked: false,
  pendant: {
    data: {
      type: 'model',
      detail: {
        id,
        model: {
          module: 'sys',
          modelTitle: name,
          name: id,
          id,
          pk: ['id'],
          fields: [{ notes: '', name: 'id', length: '32', type: 'String', fieldTitle: 'id' }],
          order: 'id desc',
        },
        component: { id, modelId: id, isCollapse: false, x, y },
        fields: [{ field: { notes: '', name: 'id', length: '32', type: 'String', fieldTitle: 'id' } }],
        familyId,
        thirdParty: false,
        size: { width: 125, height: 75 },
      },
    },
    node,
  } as any,
});

const relationState = (
  id: string,
  fromElementId: string,
  toElementId: string,
  x1: number,
  x2: number,
  y: number,
  edge = true,
) => ({
  id,
  name: '',
  color: '#ffa940',
  type: 'relation',
  points: [
    { x: x1, y },
    { x: x2, y },
  ],
  fromElementId,
  toElementId,
  pendant: {
    data: {
      type: 'relation',
      detail: {
        id,
        relation: {
          relationType: 'ONE2ONE',
          modelMainKey: ['id'],
          relationName: id,
          modelMainId: fromElementId,
          modelRelatedKey: ['id'],
          modelRelatedId: toElementId,
          relationTitle: id,
          id,
        },
        link: { id, relationId: id, color: '#ffa940', points: [] },
        thirdParty: false,
      },
    },
    edge,
  } as any,
});

const bodyIds = (node: any): string[] => {
  const ids: string[] = [];
  if (Array.isArray(node.body)) ids.push(...node.body);
  if (Array.isArray(node.cases)) node.cases.forEach((c: any) => ids.push(...(c.body || [])));
  if (Array.isArray(node.default)) ids.push(...node.default);
  return ids;
};

export const buildTest = (structure: any) => {
  const nodes: any[] = structure.nodes || [];
  const byId: Record<string, any> = {};
  nodes.forEach((n) => (byId[n.id] = n));
  const edges: any[] = structure.edges || [];

  const chain: string[] = [];
  let current = (edges.find((e) => e[0] === 'start') || [])[1] || (nodes[0] && nodes[0].id);
  const seen = new Set<string>();
  while (current && byId[current] && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    const next = (edges.find((e) => e[0] === current) || [])[1];
    current = next;
  }
  const others = nodes.map((n) => n.id).filter((id) => !seen.has(id));

  const pos: Record<string, { x: number; y: number }> = {};
  chain.forEach((id, i) => {
    pos[id] = { x: 40 + (i % 5) * 190, y: 100 + Math.floor(i / 5) * 170 };
  });
  const baseY = 100 + Math.ceil(chain.length / 5) * 170 + 120;
  others.forEach((id, i) => {
    pos[id] = { x: 40 + (i % 5) * 190, y: baseY + Math.floor(i / 5) * 170 };
  });

  const elements = nodes.map((n) => {
    const p = pos[n.id] || { x: 40, y: 100 };
    const state = nodeState(n.id, labelOf(n), p.x, p.y, n);
    if (n.id === chain[0]) state.pendant.meta = structure.meta;
    return state;
  });

  const links: any[] = [];
  let li = 0;
  chain.forEach((id, i) => {
    if (i === 0) return;
    const prev = chain[i - 1];
    li += 1;
    links.push(relationState(`e${li}`, prev, id, pos[prev].x + 125, pos[id].x, pos[prev].y + 37));
  });
  nodes.forEach((n) => {
    bodyIds(n).forEach((id) => {
      if (!pos[id]) return;
      li += 1;
      links.push(relationState(`e${li}`, n.id, id, pos[n.id].x + 125, pos[id].x, pos[n.id].y + 37, false));
    });
  });

  return { id: `canvas_${structure.meta?.task || 'task'}`, elements, links };
};
