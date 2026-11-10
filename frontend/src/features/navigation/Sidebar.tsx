import { useEffect, useState } from "react";
import kkomiIcon from "../../assets/images/kkomi-note-icon.png";
import { main as models } from "../../../wailsjs/go/models";
import { type MenuGroup, type PageKey } from "./menuTypes";
import { groupOfPage, isGroupOpen, openGroupForPage, parseOpenGroup, toggleOpenGroup, visibleGroups, visibleMenus } from "./sidebarState";
import "./sidebar.css";

type SidebarProps = {
  active: PageKey;
  appVersion: string;
  collapsed: boolean;
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onLock: () => void;
  onNavigate: (page: PageKey) => void;
};

const openGroupStorageKey = "kkomi.sidebar.openGroup";

function readOpenGroup(): MenuGroup | null {
  try {
    return parseOpenGroup(localStorage.getItem(openGroupStorageKey));
  } catch {
    return null;
  }
}

export function Sidebar({
  active,
  appVersion,
  collapsed,
  config,
  isHomeroomTeacher,
  onCollapsedChange,
  onLock,
  onNavigate,
}: SidebarProps) {
  const [classroomExpanded, setClassroomExpanded] = useState(true);
  // 한 번에 한 묶음만 펼친다('오늘'은 늘 펼침). 지금 화면이 든 묶음은 저절로 펼치고, 마지막 상태를 기억한다.
  const [openGroup, setOpenGroup] = useState<MenuGroup | null>(() => readOpenGroup() ?? groupOfPage(active));
  const items = visibleMenus(isHomeroomTeacher, config?.hiddenMenus || []);
  const groups = visibleGroups(items);

  useEffect(() => {
    setOpenGroup((current) => openGroupForPage(current, active));
  }, [active]);

  useEffect(() => {
    try {
      if (openGroup) localStorage.setItem(openGroupStorageKey, openGroup);
      else localStorage.removeItem(openGroupStorageKey);
    } catch {
      // 펼친 묶음을 기억하지 못해도 지금 화면은 그대로 쓴다.
    }
  }, [openGroup]);

  function toggleGroup(group: MenuGroup) {
    if (collapsed) {
      onCollapsedChange(false);
      setOpenGroup((current) => (isGroupOpen(group, current) ? current : group));
      return;
    }
    setOpenGroup((current) => toggleOpenGroup(current, group));
  }

  function groupContainsActive(group: MenuGroup) {
    return groupOfPage(active) === group;
  }

  return (
    <aside className="sidebar" aria-label="주 메뉴">
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
        aria-expanded={!collapsed}
        title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        <span aria-hidden="true">{collapsed ? "☰" : "‹"}</span>
        <span className="sidebar-toggle-label">메뉴 접기</span>
      </button>
      <div className="sidebar-scroll">
        <div className="brand">
          <img className="brand-mark" src={kkomiIcon} alt="꼬미노트 꼬미" />
          <div>
            <strong>꼬미노트</strong>
            <small>나만의 학교 업무공간</small>
          </div>
        </div>
        <div className="class-badge">
          <span>{config?.schoolYear ? `${config.schoolYear}학년도` : "학년도"}</span>
          <strong>
            {isHomeroomTeacher
              ? config?.grade && config?.classNumber
                ? `${config.grade}학년 ${config.classNumber}반`
                : "담임 학급 설정 필요"
              : config?.teachingSubject || "담당 교과 설정 필요"}
          </strong>
          <small>{config?.teacherLabel || "교사"}</small>
        </div>
        <nav>
          {groups.map((group) => (
            <section className="menu-group" key={group}>
              <button
                type="button"
                className={`menu-group-toggle ${groupContainsActive(group) ? "contains-active" : ""}`}
                aria-expanded={!collapsed && isGroupOpen(group, openGroup)}
                title={collapsed ? `${group} 메뉴 펼치기` : undefined}
                onClick={() => toggleGroup(group)}
              >
                <span>{group}</span>
                {group !== "오늘" && <b aria-hidden="true">{isGroupOpen(group, openGroup) ? "⌃" : "⌄"}</b>}
              </button>
              {!collapsed && isGroupOpen(group, openGroup) &&
                items
                  .filter((menu) => menu.group === group)
                  .map((menu) =>
                    menu.key === "학급 운영" ? (
                      <div className="classroom-menu" key={menu.key}>
                        <button
                          type="button"
                          className={
                            active === "자리배정" ||
                            active === "청소배정" ||
                            active === "학급 운영"
                              ? "menu active"
                              : "menu"
                          }
                          aria-expanded={classroomExpanded}
                          aria-controls="classroom-submenu"
                          onClick={() => setClassroomExpanded((value) => !value)}
                        >
                          <span>{menu.icon}</span>학급 운영
                          <b className="submenu-chevron" aria-hidden="true">
                            {classroomExpanded ? "⌃" : "⌄"}
                          </b>
                        </button>
                        <div id="classroom-submenu" hidden={!classroomExpanded}>
                          <button
                            className={
                              active === "자리배정" || active === "학급 운영"
                                ? "menu submenu active"
                                : "menu submenu"
                            }
                            onClick={() => onNavigate("자리배정")}
                          >
                            자리배정
                          </button>
                          <button
                            className={
                              active === "청소배정"
                                ? "menu submenu active"
                                : "menu submenu"
                            }
                            onClick={() => onNavigate("청소배정")}
                          >
                            청소배정
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={active === menu.key ? "menu active" : "menu"}
                        key={menu.key}
                        onClick={() => onNavigate(menu.key)}
                      >
                        <span>{menu.icon}</span>
                        {menu.key}
                      </button>
                    ),
                  )}
            </section>
          ))}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <button
          className={active === "환경 설정" ? "menu active" : "menu"}
          title="환경 설정"
          aria-label="환경 설정"
          onClick={() => onNavigate("환경 설정")}
        >
          <span>⚙</span><span className="sidebar-bottom-label">환경 설정</span>
        </button>
        <button className="lock-button" aria-label="화면 잠금" title="화면 잠금" onClick={onLock}>
          <span aria-hidden="true">▣</span> <span className="sidebar-bottom-label">화면 잠금</span>
        </button>
        <small className="creator-watermark">
          꼬미노트 {appVersion ? `v${appVersion}` : ""}
          <br />
          푸른파도소리 제작
        </small>
      </div>
    </aside>
  );
}
