"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Play,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  Table as TableIcon,
  BarChart3,
  Terminal,
} from "lucide-react";

type QueryResult = {
  success: boolean;
  message?: string;
  error?: string;
  rows?: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  executionTime?: number;
  truncated?: boolean;
};

type ExplainMetrics = {
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  startupCost: number | null;
  totalCost: number | null;
  estimatedRows: number | null;
};

type ExplainResult = {
  success: boolean;
  message?: string;
  error?: string;
  explainPlan?: string;
  explainMetrics?: ExplainMetrics;
  executionTime?: number;
};

type ProjectDetail = {
  id: number;
  name: string;
  schema_name: string;
};

type ProjectDetailResponse = {
  success: boolean;
  project?: ProjectDetail;
  error?: string;
};

type SqlResponse = QueryResult & ExplainResult;

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export default function SQLEditorPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [activeTab, setActiveTab] = useState("results");
  const [runResult, setRunResult] = useState<QueryResult | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}?lite=1`, {
          cache: "no-store",
        });
        const data = (await response.json()) as ProjectDetailResponse;
        if (!response.ok || !data.success || !data.project) {
          throw new Error(data.error || "Project not found");
        }

        if (!cancelled) {
          setProject(data.project);
        }
      } catch (error) {
        if (!cancelled) {
          setProjectError(
            error instanceof Error ? error.message : "Failed to load project"
          );
        }
      }
    };

    if (projectId) {
      void fetchProject();
    }

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleRunQuery = useCallback(async () => {
    if (!query.trim()) {
      setRunResult({ success: false, error: "Enter a SQL query to run." });
      setActiveTab("results");
      return;
    }

    setIsRunning(true);
    setActiveTab("results");

    try {
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, explain: false }),
      });
      const data = (await response.json()) as SqlResponse;

      if (!response.ok || !data.success) {
        setRunResult({
          success: false,
          error: data.error || data.message || "Query failed",
          executionTime: data.executionTime,
        });
        return;
      }

      setRunResult({
        success: true,
        message: data.message,
        rows: data.rows,
        columns: data.columns,
        rowCount: data.rowCount,
        executionTime: data.executionTime,
        truncated: data.truncated,
      });
    } catch (error) {
      setRunResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute query",
      });
    } finally {
      setIsRunning(false);
    }
  }, [projectId, query]);

  const handleExplainQuery = useCallback(async () => {
    if (!query.trim()) {
      setExplainResult({ success: false, error: "Enter a SQL query to explain." });
      setActiveTab("explain");
      return;
    }

    setIsExplaining(true);
    setActiveTab("explain");

    try {
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, explain: true }),
      });
      const data = (await response.json()) as SqlResponse;

      if (!response.ok || !data.success) {
        setExplainResult({
          success: false,
          error: data.error || data.message || "Explain failed",
          executionTime: data.executionTime,
        });
        return;
      }

      setExplainResult({
        success: true,
        message: data.message,
        explainPlan: data.explainPlan,
        explainMetrics: data.explainMetrics,
        executionTime: data.executionTime,
      });
    } catch (error) {
      setExplainResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate explain plan",
      });
    } finally {
      setIsExplaining(false);
    }
  }, [projectId, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!isRunning && !isExplaining) {
          void handleRunQuery();
        }
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        if (!isRunning && !isExplaining) {
          void handleExplainQuery();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRunQuery, handleExplainQuery, isRunning, isExplaining]);

  const isBusy = isRunning || isExplaining;
  const activeStatus =
    activeTab === "explain" ? explainResult : runResult;

  const getTablePreview = () => {
    if (!runResult?.rows || !runResult.columns?.length) return null;

    return (
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              {runResult.columns.map((col) => (
                <TableHead key={col} className="font-semibold">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {runResult.rows.map((row, idx) => (
              <TableRow key={idx} className="hover:bg-gray-50">
                {runResult.columns?.map((col) => {
                  const value = formatCellValue(row[col]);
                  return (
                    <TableCell key={col} className="font-mono text-sm">
                      {value === null ? (
                        <span className="text-gray-400">null</span>
                      ) : (
                        value
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  if (projectError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {projectError}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-var(--header-height))] flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SQL Editor</h1>
            <p className="text-sm text-gray-500 mt-1">
              {project
                ? `Project: ${project.name} | Schema: ${project.schema_name}`
                : "Loading project..."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void handleExplainQuery()}
              disabled={isBusy || !project}
              className="gap-1"
              size="sm"
            >
              {isExplaining ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                  Explaining...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4" />
                  Explain
                </>
              )}
            </Button>
            <Button
              onClick={() => void handleRunQuery()}
              disabled={isBusy || !project}
              className="gap-1 bg-black hover:bg-green-800"
              size="sm"
            >
              {isRunning ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">SQL Query</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                PostgreSQL
              </Badge>
            </div>
            <div className="relative flex flex-1 flex-col min-h-0">
              {!query && (
                <div
                  className="pointer-events-none absolute inset-0 z-0 p-4 font-mono text-sm text-gray-400"
                  aria-hidden
                >
                  Hit CTRL+SHIFT+K to generate query or just start typing
                </div>
              )}
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="relative z-10 flex-1 resize-none bg-transparent p-4 font-mono text-sm focus:outline-none"
                placeholder="Hit CTRL+SHIFT+K to generate query or just start typing"
                spellCheck={false}
                disabled={!project}
              />
            </div>
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
              Ctrl+Enter to run · Ctrl+Shift+E to explain · Schema-restricted queries only
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                    <TabsList className="h-8 bg-transparent p-0">
                      <TabsTrigger
                        value="results"
                        className="h-8 gap-1 data-[state=active]:bg-white"
                      >
                        <TableIcon className="h-3.5 w-3.5" />
                        Results
                      </TabsTrigger>
                      <TabsTrigger
                        value="explain"
                        className="h-8 gap-1 data-[state=active]:bg-white"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        Explain
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {activeStatus && (
                    <div className="flex items-center gap-2 text-xs">
                      {activeStatus.success ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-green-700">
                            {activeTab === "explain"
                              ? "Plan ready"
                              : typeof (activeStatus as QueryResult).rowCount === "number"
                                ? `${(activeStatus as QueryResult).rowCount} row(s)`
                                : "Success"}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                          <span className="text-red-700">Error</span>
                        </>
                      )}
                      {activeStatus.executionTime !== undefined && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Clock className="h-3.5 w-3.5" />
                          {activeStatus.executionTime} ms
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {activeTab === "results" && runResult?.success && runResult.rows?.length ? (
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {isRunning || isExplaining ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
                    <p className="text-sm text-gray-500">
                      {isExplaining ? "Generating explain plan..." : "Executing query..."}
                    </p>
                  </div>
                </div>
              ) : activeTab === "results" && runResult ? (
                runResult.success ? (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">Query executed successfully</span>
                      </div>
                      <p className="mt-1 text-xs text-green-700">
                        {runResult.message}
                        {runResult.truncated ? " (showing first 1000 rows)" : ""}
                      </p>
                    </div>
                    {getTablePreview()}
                    {runResult.rows?.length ? (
                      <div className="text-xs text-gray-500">
                        Showing {runResult.rows.length}
                        {typeof runResult.rowCount === "number"
                          ? ` of ${runResult.rowCount}`
                          : ""}{" "}
                        rows
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-lg bg-red-50 p-4 text-red-800">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Query Error</span>
                    </div>
                    <p className="mt-1 text-sm">{runResult.error || runResult.message}</p>
                  </div>
                )
              ) : activeTab === "results" ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-gray-100 p-4">
                    <Play className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="mt-4 text-sm font-medium text-gray-900">
                    No query executed yet
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Click Run to execute SQL in your project schema
                  </p>
                </div>
              ) : activeTab === "explain" && explainResult ? (
                explainResult.success && explainResult.explainPlan ? (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">Explain plan generated</span>
                      </div>
                      {explainResult.message ? (
                        <p className="mt-1 text-xs text-green-700">{explainResult.message}</p>
                      ) : null}
                    </div>

                    {explainResult.explainMetrics &&
                    (explainResult.explainMetrics.totalCost !== null ||
                      explainResult.explainMetrics.planningTimeMs !== null ||
                      explainResult.explainMetrics.executionTimeMs !== null ||
                      explainResult.explainMetrics.estimatedRows !== null) ? (
                      <div className="rounded-lg border border-gray-200 p-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          Query analysis
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {explainResult.explainMetrics.totalCost !== null ? (
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Total cost</span>
                              <span className="font-mono">
                                {explainResult.explainMetrics.totalCost}
                              </span>
                            </div>
                          ) : null}
                          {explainResult.explainMetrics.estimatedRows !== null ? (
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Est. rows</span>
                              <span className="font-mono">
                                {explainResult.explainMetrics.estimatedRows}
                              </span>
                            </div>
                          ) : null}
                          {explainResult.explainMetrics.planningTimeMs !== null ? (
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Planning time</span>
                              <span className="font-mono">
                                {explainResult.explainMetrics.planningTimeMs} ms
                              </span>
                            </div>
                          ) : null}
                          {explainResult.explainMetrics.executionTimeMs !== null ? (
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Execution time</span>
                              <span className="font-mono">
                                {explainResult.explainMetrics.executionTimeMs} ms
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-lg bg-blue-50 p-4">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">Query plan</h4>
                      <pre className="text-xs font-mono text-blue-800 whitespace-pre-wrap">
                        {explainResult.explainPlan}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-red-50 p-4 text-red-800">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Explain error</span>
                    </div>
                    <p className="mt-1 text-sm">
                      {explainResult.error || explainResult.message}
                    </p>
                  </div>
                )
              ) : activeTab === "explain" ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-gray-100 p-4">
                    <BarChart3 className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="mt-4 text-sm font-medium text-gray-900">
                    No explain plan yet
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Click Explain or press Ctrl+Shift+E to analyze your query
                  </p>
                </div>
              ) : null}
            </div>

            {!runResult && !isRunning && activeTab === "results" && (
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
                Click <span className="font-medium text-blue-600">Run</span> to execute your
                query
              </div>
            )}
            {!explainResult && !isExplaining && activeTab === "explain" && (
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
                Click <span className="font-medium text-blue-600">Explain</span> to view the
                query plan
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
