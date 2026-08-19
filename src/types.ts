// 接口定义已移至 src/engines/codec.ts，避免重复
// 此文件保留作为类型集中导出入口
export type { DiffEntry, CorrectionResult } from "./engines/codec";

/** 全局共享的错误修正单元（4 个入口共用，勿在各入口重复定义） */
export type Diff = import("./engines/codec").DiffEntry;
