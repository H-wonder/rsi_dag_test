import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Select } from 'antd';
import styles from './index.module.css';
import type { LoginProps } from './types';

import VisualDiagram, { VisualToolbarConfig } from '@horsecoder/visual-core';


import {
  VisualCanvasConfig,
  VisualElementConfig,
  VisualLinkConfig,
} from '@horsecoder/visual-core';
import StandardModelEntityWrapper from '@/components/StandardModelEntity/wrapper';
import StandardModelLinkWrapper from '@/components/StandardModelLink/wrapper';
import { getView, refreshCanvasLocked, refreshElementLocked, setView } from './handler/handler/diagramHandler';

import { flowRunFacade } from '@/src/flows/com.horsecoder.common.whuTalent.flowTesting.core/Run';
import { structures } from './test/structures';
import { buildTest } from './test/buildTest';

const TASK_NAMES = Object.keys(structures);


/**
 * 组件布局: 登录
 */
const LoginPage: React.FC<LoginProps> = () => {



  // 内部数据: diagramRefInner(diagramRef)
  const diagramRef = useRef<any>(null);
  const [testName, setTestName] = useState<string>(TASK_NAMES[0] || '');
  const [viewReady, setViewReady] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  // 内部数据: 工具栏配置(toolbarConfig)
  const toolbarConfig: VisualToolbarConfig = useMemo(() => [], []);

  const runStructure = async () => {
    const view: any = getView(diagramRef);
    const elements: any[] = view?.elements ?? [];
    const nodes = elements
      .map((element: any) => element?.pendant?.node)
      .filter(Boolean);
    const carrier = elements.find((element: any) => element?.pendant?.meta);
    const meta = carrier?.pendant?.meta;
    const first = carrier?.pendant?.node || nodes[0];
    const edges: any[] = [];
    if (first) {
      edges.push(['start', first.id]);
      (view?.links ?? []).forEach((link: any) => {
        if (link?.pendant?.edge !== false) {
          edges.push([link.fromElementId, link.toElementId]);
        }
      });
    }
    const structure = nodes.length ? { meta, nodes, edges } : view;
    try {
      const value: any = await flowRunFacade({ structure: JSON.stringify(structure) });
      const parsed = typeof value?.result === 'string' ? JSON.parse(value.result) : value;
      setRunResult(parsed);
    } catch (error: any) {
      setRunResult({ error: error?.message || String(error) });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const task = new URLSearchParams(window.location.search).get('task');
      if (task && structures[task]) setTestName(task);
    }
    // 等 URL 里的 task 同步完，再挂载视图，避免连续两次 setView 造成状态竞争。
    setViewReady(true);
  }, []);

  useEffect(() => {
    if (viewReady && diagramRef.current && testName) {
      refreshCanvasLocked(diagramRef, false);
      setView(diagramRef, buildTest(structures[testName]) as any);
      if (typeof window !== 'undefined' && window.location.search.includes('autorun')) {
        setTimeout(runStructure, 800);
      }
    }
  }, [viewReady, testName])




  const elementConfig: VisualElementConfig = useMemo(
    () => ({
      components: {
        model: {
          component: StandardModelEntityWrapper,
          minSize: {
            width: 100,
            height: 55,
          },
        },
      },
    }),
    [],
  );

  const linkConfig: VisualLinkConfig = useMemo(
    () => ({
      components: {
        relation: {
          component: StandardModelLinkWrapper,
          hasArrow: true,
          showName: true,
        },
      },
    }),
    [],
  );

    const canvasConfig: VisualCanvasConfig = useMemo(
    () => ({
      toolbarConfig,
      elementConfig,
      linkConfig,
      globalConfig: {
        gridSize: 25,
      },
    }),
    [toolbarConfig, elementConfig, linkConfig],
  );


  return (
    <>
      <div
        className={styles.div}
      >
        <Select
          value={testName}
          onChange={(value) => setTestName(value)}
          style={{ width: 260, marginRight: 12 }}
          options={TASK_NAMES.map((task) => ({ value: task, label: task }))}
        />
        <Button
          className={styles.divButton0}
          type="primary"
          onClick={runStructure}
        >
          {`运行`}
        </Button>
      </div>
      {runResult && (
        <div style={{ margin: '8px 16px', maxHeight: 220, overflow: 'auto', background: '#111', color: '#7CFC00', padding: 8, fontSize: 12 }}>
          <div>
            status: {String(runResult.status ?? '-')} | score: {runResult.score?.score ?? '-'} |
            assertions: {runResult.score?.assertions_passed ?? '-'}/{runResult.score?.assertions_total ?? '-'}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(runResult.loops ?? runResult, null, 2).slice(0, 2000)}
          </pre>
        </div>
      )}
      <VisualDiagram
        // className={styles.divDiv0}
        ref={diagramRef}
        // {...props.actions.eventsDiv}
        canvasConfig={canvasConfig}
      />
    </>
  );
};

export default LoginPage;
