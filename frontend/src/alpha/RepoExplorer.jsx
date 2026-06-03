import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  FileCode, FolderOpen, Folder, ChevronDown, ChevronRight,
  FilePlus, FolderPlus, Edit2, Trash2, Copy, Loader, X, Check,
} from "lucide-react";

// ── 파일 타입별 색상 ───────────────────────────────────────────────────────────
function getFileColor(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return {
    py: "#3b9edd",
    js: "#cbcb41", jsx: "#cbcb41",
    ts: "#007acc", tsx: "#007acc",
    json: "#cbcb41",
    md: "#6182b8",
    yml: "#e37933", yaml: "#e37933",
    html: "#e34c26",
    css: "#563d7c",
    sh: "#4eaa25",
    java: "#b07219",
  }[ext] || "#9CA3AF";
}

// ── flat file list → 재귀 트리 변환 ──────────────────────────────────────────
function buildTree(files, localFolders) {
  const root = { name: "", children: {}, files: [], isFolder: true };

  // 실제 파일 추가 (deleted 포함해서 트리에 포함)
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.children[seg]) {
        node.children[seg] = { name: seg, children: {}, files: [], isFolder: true };
      }
      node = node.children[seg];
    }
    node.files.push({ name: parts[parts.length - 1], path: file.path, sha: file.sha });
  }

  // localFolders 추가
  if (localFolders) {
    for (const folderPath of localFolders) {
      const parts = folderPath.split("/");
      let node = root;
      for (const seg of parts) {
        if (!node.children[seg]) {
          node.children[seg] = { name: seg, children: {}, files: [], isFolder: true, isLocal: true };
        }
        node = node.children[seg];
      }
    }
  }

  return root;
}

// ── 인라인 입력 컴포넌트 ──────────────────────────────────────────────────────
function InlineInput({ defaultValue = "", placeholder = "", onConfirm, onCancel, autoSelectAll = true }) {
  const ref = useRef(null);
  const [val, setVal] = useState(defaultValue);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      if (autoSelectAll) ref.current.select();
    }
  }, [autoSelectAll]);

  const confirm = () => {
    const trimmed = val.trim();
    if (trimmed) onConfirm(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      placeholder={placeholder}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") confirm();
        if (e.key === "Escape") onCancel();
      }}
      onClick={e => e.stopPropagation()}
      style={{
        flex: 1,
        padding: "1px 5px",
        background: "#0f1117",
        border: "1px solid rgba(96,165,250,0.6)",
        borderRadius: 3,
        color: "#e2e8f0",
        fontSize: 11,
        outline: "none",
        minWidth: 0,
      }}
    />
  );
}

// ── 컨텍스트 메뉴 ─────────────────────────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("mousedown", handler);
    document.addEventListener("contextmenu", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("contextmenu", handler);
    };
  }, [onClose]);

  // 화면 경계 보정
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = (x - rect.width) + "px";
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = (y - rect.height) + "px";
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 9999,
        background: "#1e2433",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        minWidth: 160,
        padding: "3px 0",
      }}
    >
      {items.map((item, i) =>
        item === "---" ? (
          <div key={i} style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "3px 0" }} />
        ) : (
          <div
            key={i}
            onClick={e => { e.stopPropagation(); item.action(); onClose(); }}
            style={{
              padding: "5px 12px",
              fontSize: 11.5,
              color: item.danger ? "#f87171" : "#cbd5e1",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              userSelect: "none",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            {item.icon && <span style={{ opacity: 0.7 }}>{item.icon}</span>}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && <span style={{ fontSize: 10, color: "#64748b" }}>{item.shortcut}</span>}
          </div>
        )
      )}
    </div>
  );
}

// ── 트리 노드 재귀 컴포넌트 ───────────────────────────────────────────────────
function TreeNode({
  node, depth,
  modifiedFiles, deletedFiles, localFolders,
  onOpenFile, activeFilePath, fetchingFile,
  onCreate, onDelete, onRename,
  selectedPath, onSelect,
  inlineNew, setInlineNew,
  renamingPath, setRenamingPath,
}) {
  const [open, setOpen] = useState(depth < 2);
  const isRoot = !node.name;

  const dirs = useMemo(
    () => Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b)),
    [node.children]
  );
  const files = useMemo(
    () => [...node.files].sort((a, b) => a.name.localeCompare(b.name)),
    [node.files]
  );

  const childDepth = isRoot ? depth : depth + 1;
  const indent = childDepth * 12 + 8;

  // 이 노드의 path (root는 "")
  const nodePath = node.path || (node.name && depth > 0 ? node.name : "");

  const handleFolderCtxMenu = (e, folderPath) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(folderPath);
    setContextMenu({
      x: e.clientX, y: e.clientY,
      type: "folder",
      path: folderPath,
    });
  };

  const handleFileCtxMenu = (e, filePath) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(filePath);
    setContextMenu({
      x: e.clientX, y: e.clientY,
      type: "file",
      path: filePath,
    });
  };

  // context menu state는 최상위에서 관리 — 여기선 prop으로 받음
  const { contextMenu, setContextMenu } = useContextMenu();

  // 인라인 new input이 이 폴더에 해당하는지
  const myFolderPath = node.path || "";

  const showNewInput = inlineNew && inlineNew.parentPath === myFolderPath;

  const handleConfirmNew = (name) => {
    const fullPath = myFolderPath ? `${myFolderPath}/${name}` : name;
    onCreate(fullPath, inlineNew.type);
    setInlineNew(null);
  };

  if (isRoot) {
    return (
      <div>
        {/* 루트 레벨 인라인 입력 */}
        {showNewInput && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", paddingLeft: indent }}>
            {inlineNew.type === "folder"
              ? <Folder size={11} color="#60a5fa" style={{ flexShrink: 0 }} />
              : <FileCode size={11} color="#9CA3AF" style={{ flexShrink: 0 }} />
            }
            <InlineInput
              placeholder={inlineNew.type === "folder" ? "폴더명" : "파일명.py"}
              onConfirm={handleConfirmNew}
              onCancel={() => setInlineNew(null)}
            />
          </div>
        )}
        {dirs.map(([dirName, child]) => (
          <TreeNode key={dirName}
            node={{ ...child, path: dirName }}
            depth={childDepth}
            modifiedFiles={modifiedFiles} deletedFiles={deletedFiles} localFolders={localFolders}
            onOpenFile={onOpenFile} activeFilePath={activeFilePath} fetchingFile={fetchingFile}
            onCreate={onCreate} onDelete={onDelete} onRename={onRename}
            selectedPath={selectedPath} onSelect={onSelect}
            inlineNew={inlineNew} setInlineNew={setInlineNew}
            renamingPath={renamingPath} setRenamingPath={setRenamingPath}
          />
        ))}
        {files.map(f => (
          <FileRow key={f.path}
            file={f} indent={indent}
            modifiedFiles={modifiedFiles} deletedFiles={deletedFiles}
            onOpenFile={onOpenFile} activeFilePath={activeFilePath} fetchingFile={fetchingFile}
            onDelete={onDelete} onRename={onRename}
            selectedPath={selectedPath} onSelect={onSelect}
            renamingPath={renamingPath} setRenamingPath={setRenamingPath}
            onContextMenu={handleFileCtxMenu}
          />
        ))}
      </div>
    );
  }

  // 폴더 노드
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;

  return (
    <div>
      <div
        onClick={() => { onSelect(node.path); setOpen(o => !o); }}
        onContextMenu={(e) => handleFolderCtxMenu(e, node.path)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: `4px 8px 4px ${8 + depth * 12}px`,
          cursor: "pointer",
          userSelect: "none",
          background: isSelected ? "rgba(96,165,250,0.08)" : "transparent",
          color: "#9CA3AF",
          fontSize: 11,
          fontWeight: 600,
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {open
          ? <FolderOpen size={11} color="#60a5fa" style={{ flexShrink: 0 }} />
          : <Folder size={11} color="#60a5fa" style={{ flexShrink: 0 }} />
        }
        {isRenaming ? (
          <InlineInput
            defaultValue={node.name}
            onConfirm={(newName) => {
              const parentPath = node.path.includes("/")
                ? node.path.split("/").slice(0, -1).join("/")
                : "";
              const newPath = parentPath ? `${parentPath}/${newName}` : newName;
              onRename(node.path, newPath);
              setRenamingPath(null);
            }}
            onCancel={() => setRenamingPath(null)}
          />
        ) : (
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
            {node.isLocal && (
              <span style={{ marginLeft: 4, fontSize: 9, color: "#73c991", fontWeight: 700 }}>U</span>
            )}
          </span>
        )}
      </div>

      {open && (
        <div>
          {/* 이 폴더에 대한 인라인 입력 */}
          {showNewInput && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", paddingLeft: indent }}>
              {inlineNew.type === "folder"
                ? <Folder size={11} color="#60a5fa" style={{ flexShrink: 0 }} />
                : <FileCode size={11} color="#9CA3AF" style={{ flexShrink: 0 }} />
              }
              <InlineInput
                placeholder={inlineNew.type === "folder" ? "폴더명" : "파일명.py"}
                onConfirm={handleConfirmNew}
                onCancel={() => setInlineNew(null)}
              />
            </div>
          )}
          {dirs.map(([dirName, child]) => {
            const childPath = node.path ? `${node.path}/${dirName}` : dirName;
            return (
              <TreeNode key={dirName}
                node={{ ...child, name: dirName, path: childPath }}
                depth={childDepth}
                modifiedFiles={modifiedFiles} deletedFiles={deletedFiles} localFolders={localFolders}
                onOpenFile={onOpenFile} activeFilePath={activeFilePath} fetchingFile={fetchingFile}
                onCreate={onCreate} onDelete={onDelete} onRename={onRename}
                selectedPath={selectedPath} onSelect={onSelect}
                inlineNew={inlineNew} setInlineNew={setInlineNew}
                renamingPath={renamingPath} setRenamingPath={setRenamingPath}
              />
            );
          })}
          {files.map(f => (
            <FileRow key={f.path}
              file={f} indent={indent}
              modifiedFiles={modifiedFiles} deletedFiles={deletedFiles}
              onOpenFile={onOpenFile} activeFilePath={activeFilePath} fetchingFile={fetchingFile}
              onDelete={onDelete} onRename={onRename}
              selectedPath={selectedPath} onSelect={onSelect}
              renamingPath={renamingPath} setRenamingPath={setRenamingPath}
              onContextMenu={handleFileCtxMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 파일 행 컴포넌트 ──────────────────────────────────────────────────────────
function FileRow({
  file, indent,
  modifiedFiles, deletedFiles,
  onOpenFile, activeFilePath, fetchingFile,
  onDelete, onRename,
  selectedPath, onSelect,
  renamingPath, setRenamingPath,
  onContextMenu,
}) {
  const isActive = file.path === activeFilePath;
  const isModified = file.path in modifiedFiles;
  const isNew = isModified && !file.sha;
  const isDeleted = deletedFiles.has(file.path);
  const isFetching = file.path === fetchingFile;
  const isSelected = selectedPath === file.path;
  const isRenaming = renamingPath === file.path;
  const fileColor = getFileColor(file.name);

  const badge = isDeleted ? "D" : isNew ? "U" : isModified ? "M" : null;
  const badgeColor = isDeleted ? "#f87171" : isNew ? "#73c991" : "#e2b714";

  return (
    <div
      onClick={() => { if (!isFetching && !isDeleted) { onSelect(file.path); onOpenFile(file.path); } }}
      onContextMenu={(e) => onContextMenu(e, file.path)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: `3px 8px 3px ${indent}px`,
        cursor: isFetching ? "wait" : isDeleted ? "default" : "pointer",
        background: isActive ? "rgba(96,165,250,0.1)" : isSelected ? "rgba(255,255,255,0.05)" : "transparent",
        color: isDeleted ? "#f87171" : isActive ? "#e2e8f0" : "#6B7280",
        fontSize: 11,
        userSelect: "none",
      }}
      onMouseEnter={e => { if (!isActive && !isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={e => { if (!isActive && !isSelected) e.currentTarget.style.background = "transparent"; }}
    >
      {isFetching
        ? <Loader size={10} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
        : <FileCode size={10} color={isDeleted ? "#f87171" : isActive ? "#93c5fd" : fileColor} style={{ flexShrink: 0 }} />
      }
      {isRenaming ? (
        <InlineInput
          defaultValue={file.name}
          onConfirm={(newName) => {
            const parentPath = file.path.includes("/")
              ? file.path.split("/").slice(0, -1).join("/")
              : "";
            const newPath = parentPath ? `${parentPath}/${newName}` : newName;
            onRename(file.path, newPath);
            setRenamingPath(null);
          }}
          onCancel={() => setRenamingPath(null)}
        />
      ) : (
        <span style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: isDeleted ? "line-through" : "none",
          opacity: isDeleted ? 0.7 : 1,
        }}>
          {file.name}
        </span>
      )}
      {badge && !isRenaming && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: badgeColor,
          flexShrink: 0,
          minWidth: 10,
          textAlign: "center",
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Context를 대신하는 간단한 글로벌 context menu 상태 관리 ──────────────────
// RepoExplorer 최상위에서 관리하며 TreeNode/FileRow에 콜백으로 전달
const ContextMenuContext = React.createContext({ contextMenu: null, setContextMenu: () => {} });
function useContextMenu() { return React.useContext(ContextMenuContext); }

// ── 메인 RepoExplorer 컴포넌트 ───────────────────────────────────────────────
export default function RepoExplorer({
  repoFiles = [],
  modifiedFiles = {},
  deletedFiles = new Set(),
  localFolders = new Set(),
  onOpenFile,
  activeFilePath,
  fetchingFile,
  onCreate,
  onDelete,
  onRename,
  triggerNew,
  onTriggerNewDone,
  selectedPath,
  onSelect,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [inlineNew, setInlineNew] = useState(null);
  const [renamingPath, setRenamingPath] = useState(null);
  const containerRef = useRef(null);

  // triggerNew prop 변경 시 인라인 입력 표시
  useEffect(() => {
    if (triggerNew) {
      setInlineNew(triggerNew);
      onTriggerNewDone?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNew]);

  // 키보드 단축키
  useEffect(() => {
    const handler = (e) => {
      if (!selectedPath) return;
      // 인라인 입력 중이면 무시
      if (inlineNew || renamingPath) return;

      if (e.key === "F2") {
        e.preventDefault();
        setRenamingPath(selectedPath);
      }
      if (e.key === "Delete") {
        e.preventDefault();
        const isFile = repoFiles.some(f => f.path === selectedPath);
        const type = isFile ? "file" : "folder";
        const name = selectedPath.split("/").pop();
        if (window.confirm(`"${name}"을(를) 삭제하시겠습니까?`)) {
          onDelete(selectedPath, type);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedPath, inlineNew, renamingPath, repoFiles, onDelete]);

  // 컨텍스트 메뉴 닫기
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // 컨텍스트 메뉴 아이템 생성
  const buildMenuItems = useCallback((menu) => {
    if (!menu) return [];
    const { type, path } = menu;
    const items = [];

    if (type === "folder") {
      items.push({
        label: "새 파일",
        icon: <FilePlus size={11} />,
        action: () => setInlineNew({ type: "file", parentPath: path }),
      });
      items.push({
        label: "새 폴더",
        icon: <FolderPlus size={11} />,
        action: () => setInlineNew({ type: "folder", parentPath: path }),
      });
      items.push("---");
      items.push({
        label: "이름 바꾸기",
        icon: <Edit2 size={11} />,
        shortcut: "F2",
        action: () => setRenamingPath(path),
      });
      items.push({
        label: "경로 복사",
        icon: <Copy size={11} />,
        action: () => navigator.clipboard.writeText(path),
      });
      items.push("---");
      items.push({
        label: "삭제",
        icon: <Trash2 size={11} />,
        danger: true,
        action: () => {
          const name = path.split("/").pop();
          if (window.confirm(`폴더 "${name}"을(를) 삭제하시겠습니까?\n(하위 파일도 모두 삭제됩니다)`)) {
            onDelete(path, "folder");
          }
        },
      });
    } else {
      items.push({
        label: "이름 바꾸기",
        icon: <Edit2 size={11} />,
        shortcut: "F2",
        action: () => setRenamingPath(path),
      });
      items.push({
        label: "경로 복사",
        icon: <Copy size={11} />,
        action: () => navigator.clipboard.writeText(path),
      });
      items.push("---");
      items.push({
        label: "삭제",
        icon: <Trash2 size={11} />,
        danger: true,
        action: () => {
          const name = path.split("/").pop();
          if (window.confirm(`"${name}"을(를) 삭제하시겠습니까?`)) {
            onDelete(path, "file");
          }
        },
      });
    }

    return items;
  }, [onDelete]);

  const tree = useMemo(() => buildTree(repoFiles, localFolders), [repoFiles, localFolders]);
  const deletedSet = deletedFiles instanceof Set ? deletedFiles : new Set(deletedFiles);

  return (
    <ContextMenuContext.Provider value={{ contextMenu, setContextMenu }}>
      <div
        ref={containerRef}
        style={{ position: "relative" }}
        onContextMenu={e => {
          // 배경 우클릭 시 루트에 새파일 메뉴
          if (e.target === containerRef.current) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", path: "" });
          }
        }}
      >
        <TreeNode
          node={{ ...tree, path: "", name: "" }}
          depth={0}
          modifiedFiles={modifiedFiles}
          deletedFiles={deletedSet}
          localFolders={localFolders}
          onOpenFile={onOpenFile}
          activeFilePath={activeFilePath}
          fetchingFile={fetchingFile}
          onCreate={onCreate}
          onDelete={onDelete}
          onRename={onRename}
          selectedPath={selectedPath}
          onSelect={onSelect}
          inlineNew={inlineNew}
          setInlineNew={setInlineNew}
          renamingPath={renamingPath}
          setRenamingPath={setRenamingPath}
        />

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={buildMenuItems(contextMenu)}
            onClose={closeContextMenu}
          />
        )}
      </div>
    </ContextMenuContext.Provider>
  );
}
