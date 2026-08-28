# Aethernfall Mobile 2.5D RC 0.6 — Test Report

## Исправления, проверенные в коде
- FPS 30/40/45/60/90/120: цикл `requestAnimationFrame` планируется до проверки throttle, поэтому ранний `return` больше не убивает рендер-цикл.
- Мобильное управление: в runtime отсутствуют keyboard/mouse обработчики; используются pointer/touch события.
- Взаимодействия: разведчик, ресурс и портал используют единый `nearbyInteraction()` с явным приоритетом и радиусами.
- Ориентация игрока: хранится только как угол `player.dir`; нет отрицательного scaleX/переворота модели.
- Навыки: ближний секторный удар, тройной снаряд, восстановление здоровья.
- Zoom: блокируются gesturestart/gesturechange/gestureend, double-tap и multi-touch move.
- Квесты: отдельное состояние для каждой из трёх зон, реальные счётчики и переходы.
- Качество графики: меняет DPR/render scale, плотность окружения, лимит врагов, частицы, детализацию и туман.
- Добавлен HUD ресурсов.
- Добавлен оригинальный procedural texture pack: grass, dirt, stone, water, wood, foliage, rune, leather, parchment.

## Runtime smoke test
Node VM с минимальными DOM/canvas stubs:
- начальное состояние квеста — PASS;
- разговор с разведчиком — PASS;
- сбор 3 трав — PASS;
- убийство 4 налётчиков — PASS;
- разблокировка перехода — PASS;
- повторное планирование render loop после throttle — PASS.

## Static checks
- game.js syntax — PASS
- sw.js syntax — PASS
- ZIP integrity (`ZipFile.testzip`) — PASS
- desktop keyboard handlers absent — PASS
- mouse handlers absent — PASS
- FPS options present — PASS
- zoom prevention present — PASS

## Ограничение тестовой среды
Полноценный headless browser interaction test через Chromium/Playwright не завершился, потому что среда блокирует навигацию браузера на localhost/file URL (`ERR_BLOCKED_BY_ADMINISTRATOR`). Поэтому фактический интерактивный прогон выполнен через Node VM smoke harness, а не через полноценный браузерный UI.
