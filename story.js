"use strict";

(() => {
  'use strict';

  const NPCS = Object.freeze({
    lyra:Object.freeze({
      name:'Лира Вейл', role:'исследовательница разлома',
      motivation:'Запечатать Осколок, не повторив ошибку древних хранителей.',
      voice:Object.freeze({ rate:.94, pitch:1.12 })
    }),
    toren:Object.freeze({
      name:'Торен Пепельный', role:'бывший страж Пепельного поста',
      motivation:'Обратить силу Осколка против существ, разоряющих пять земель.',
      voice:Object.freeze({ rate:.88, pitch:.78 })
    }),
    mira:Object.freeze({
      name:'Мира Сол', role:'хранительница дорожных клятв',
      motivation:'Сберечь жителей и не дать спору Лиры и Торена расколоть союз.',
      voice:Object.freeze({ rate:1.02, pitch:.98 })
    })
  });

  const NODES = Object.freeze({
    mist_oath:Object.freeze({
      npc:'mira',
      lines:Object.freeze([
        Object.freeze({ speaker:'mira', text:'Туман больше не скрывает лес — он утекает к древнему разлому.' }),
        Object.freeze({ speaker:'lyra', text:'Три пробуждённых хранителя покажут путь к сердцу Aethernfall. Я отмечу их след.' })
      ]),
      choices:Object.freeze([])
    }),
    stone_doctrine:Object.freeze({
      npc:'lyra',
      lines:Object.freeze([
        Object.freeze({ speaker:'lyra', text:'Страж удерживал не сокровище, а часть печати. Её можно восстановить.' }),
        Object.freeze({ speaker:'toren', text:'Или связать с клинком. Мёртвая печать не защитит живых.' })
      ]),
      choices:Object.freeze([
        Object.freeze({ id:'seal', label:'Восстановить печать', group:'shardDoctrine', effects:Object.freeze([
          Object.freeze({ type:'setChoice', id:'shardDoctrine', value:'seal' }),
          Object.freeze({ type:'setFlag', id:'doctrineChosen' }),
          Object.freeze({ type:'relation', npc:'lyra', amount:1 }),
          Object.freeze({ type:'relation', npc:'toren', amount:-1 }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'storyBoon', id:'guardedResolve' }) }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'questEvent', event:'storyChoice', target:'shardDoctrine' }) })
        ]) }),
        Object.freeze({ id:'bind', label:'Связать силу с клинком', group:'shardDoctrine', effects:Object.freeze([
          Object.freeze({ type:'setChoice', id:'shardDoctrine', value:'bind' }),
          Object.freeze({ type:'setFlag', id:'doctrineChosen' }),
          Object.freeze({ type:'relation', npc:'toren', amount:1 }),
          Object.freeze({ type:'relation', npc:'lyra', amount:-1 }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'storyBoon', id:'boundForce' }) }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'questEvent', event:'storyChoice', target:'shardDoctrine' }) })
        ]) })
      ])
    }),
    ash_warning:Object.freeze({
      npc:'toren', condition:Object.freeze({ flags:Object.freeze(['doctrineChosen']) }),
      lines:Object.freeze([
        Object.freeze({ speaker:'toren', text:'Пламя указывает на север. За Пепельным маяком замёрзла ещё одна часть печати.' }),
        Object.freeze({ speaker:'mira', text:'В Морозной низине остались дозорные. Наш выбор должен оставить им будущее.' })
      ]), choices:Object.freeze([])
    }),
    frost_wardens:Object.freeze({
      npc:'mira', condition:Object.freeze({ flags:Object.freeze(['doctrineChosen']) }),
      lines:Object.freeze([
        Object.freeze({ speaker:'mira', text:'Башня удерживает разлом, но мороз забирает силы последних дозорных.' }),
        Object.freeze({ speaker:'lyra', text:'Мы можем сохранить круг печати — или разбить башню и забрать её энергию.' })
      ]),
      choices:Object.freeze([
        Object.freeze({ id:'protect', label:'Защитить дозорных', group:'wardenFate', effects:Object.freeze([
          Object.freeze({ type:'setChoice', id:'wardenFate', value:'protect' }),
          Object.freeze({ type:'setFlag', id:'wardensDecided' }),
          Object.freeze({ type:'relation', npc:'mira', amount:1 }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'arenaModifier', id:'wardensAid' }) }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'questEvent', event:'storyChoice', target:'wardenFate' }) })
        ]) }),
        Object.freeze({ id:'break', label:'Разрушить башню', group:'wardenFate', effects:Object.freeze([
          Object.freeze({ type:'setChoice', id:'wardenFate', value:'break' }),
          Object.freeze({ type:'setFlag', id:'wardensDecided' }),
          Object.freeze({ type:'relation', npc:'toren', amount:1 }),
          Object.freeze({ type:'relation', npc:'mira', amount:-1 }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'arenaModifier', id:'shardSurge' }) }),
          Object.freeze({ type:'emit', effect:Object.freeze({ type:'questEvent', event:'storyChoice', target:'wardenFate' }) })
        ]) })
      ])
    }),
    star_council:Object.freeze({
      npc:'lyra', condition:Object.freeze({ flags:Object.freeze(['doctrineChosen','wardensDecided']) }),
      lines:Object.freeze([
        Object.freeze({ speaker:'lyra', text:'Обсерватория открыта. За ней — источник, который разбудил всех хранителей.' }),
        Object.freeze({ speaker:'toren', text:'Какой бы путь мы ни выбрали, Владыка разлома должен пасть.' }),
        Object.freeze({ speaker:'mira', text:'Тогда наш выбор станет судьбой пяти земель. Войдём вместе.' })
      ]), choices:Object.freeze([])
    })
  });

  const ENDINGS = Object.freeze({
    restoration:Object.freeze({
      title:'Печать пяти земель',
      text:'Осколок возвращён в круг печати. Разлом затихает, а освобождённые дозорные становятся хранителями нового союза.'
    }),
    ascension:Object.freeze({
      title:'Клятва живого пламени',
      text:'Сила разлома связана с героем. Пять земель получают защитника, но отблеск Aethernfall навсегда остаётся в его клинке.'
    })
  });

  const objectLike = value => value && typeof value === 'object' && !Array.isArray(value);
  const clamp = value => Math.max(-3, Math.min(3, Number.isFinite(value) ? Math.round(value) : 0));
  const fail = message => { throw new Error(`Invalid story definition: ${message}`); };

  function createEngine({ npcs, nodes, endings } = {}) {
    if (!objectLike(npcs) || !objectLike(nodes) || !objectLike(endings) || !Object.keys(nodes).length) fail('registries required');
    const flagIds = new Set(), choiceValues = {}, nodeIds = new Set(Object.keys(nodes));
    for (const [id, node] of Object.entries(nodes)) {
      if (!objectLike(node) || !Object.hasOwn(npcs, node.npc) || !Array.isArray(node.lines) || !Array.isArray(node.choices)) fail(`${id} shape`);
      if (node.lines.some(line => !Object.hasOwn(npcs, line.speaker) || typeof line.text !== 'string' || !line.text)) fail(`${id} lines`);
      for (const flag of node.condition?.flags || []) flagIds.add(flag);
      for (const choice of node.choices) {
        if (!choice.id || !choice.group || !Array.isArray(choice.effects)) fail(`${id} choice`);
        if (!choiceValues[choice.group]) choiceValues[choice.group] = new Set();
        for (const effect of choice.effects) {
          if (effect.type === 'setFlag') flagIds.add(effect.id);
          if (effect.type === 'setChoice') choiceValues[effect.id]?.add(effect.value);
          if (effect.type === 'relation' && !Object.hasOwn(npcs, effect.npc)) fail(`${id} relation`);
        }
      }
    }

    function initialState() {
      return Object.freeze({ flags:Object.freeze({}), choices:Object.freeze({}), relations:Object.freeze(Object.fromEntries(Object.keys(npcs).map(id => [id, 0]))), seen:Object.freeze([]), ending:'' });
    }

    function normalize(raw) {
      const source = objectLike(raw) ? raw : {}, flags = {}, choices = {}, relations = {};
      for (const id of flagIds) if (source.flags?.[id] === true) flags[id] = true;
      for (const [id, values] of Object.entries(choiceValues)) if (values.has(source.choices?.[id])) choices[id] = source.choices[id];
      for (const id of Object.keys(npcs)) relations[id] = clamp(source.relations?.[id]);
      const seen = Array.isArray(source.seen) ? [...new Set(source.seen.filter(id => typeof id === 'string' && nodeIds.has(id)))] : [];
      const ending = Object.hasOwn(endings, source.ending) ? source.ending : '';
      return Object.freeze({ flags:Object.freeze(flags), choices:Object.freeze(choices), relations:Object.freeze(relations), seen:Object.freeze(seen), ending });
    }

    function conditionsMet(state, condition) {
      if (!condition) return true;
      return (condition.flags || []).every(id => state.flags[id] === true);
    }

    function inspect(raw, nodeId) {
      const state = normalize(raw), node = nodes[nodeId];
      if (!node) return Object.freeze({ available:false, lines:Object.freeze([]), choices:Object.freeze([]) });
      const available = conditionsMet(state, node.condition);
      const choices = available ? node.choices.filter(choice => !state.choices[choice.group]).map(choice => Object.freeze({ id:choice.id, label:choice.label })) : [];
      return Object.freeze({ available, npc:node.npc, lines:available ? node.lines : Object.freeze([]), choices:Object.freeze(choices) });
    }

    function choose(raw, nodeId, choiceId) {
      const state = normalize(raw), node = nodes[nodeId], view = inspect(state, nodeId);
      const choice = view.available ? node.choices.find(item => item.id === choiceId) : null;
      if (!choice || state.choices[choice.group]) return Object.freeze({ changed:false, state, effects:Object.freeze([]) });
      const flags = { ...state.flags }, choices = { ...state.choices }, relations = { ...state.relations }, effects = [];
      for (const effect of choice.effects) {
        if (effect.type === 'setFlag') flags[effect.id] = true;
        else if (effect.type === 'setChoice') choices[effect.id] = effect.value;
        else if (effect.type === 'relation') relations[effect.npc] = clamp(relations[effect.npc] + effect.amount);
        else if (effect.type === 'emit') effects.push({ ...effect.effect });
      }
      const seen = state.seen.includes(nodeId) ? [...state.seen] : [...state.seen, nodeId];
      const next = normalize({ flags, choices, relations, seen, ending:state.ending });
      return Object.freeze({ changed:true, state:next, effects:Object.freeze(effects.map(Object.freeze)) });
    }

    function deriveEnding(raw) {
      const state = normalize(raw);
      const id = state.choices.shardDoctrine === 'seal' && state.choices.wardenFate === 'protect' ? 'restoration' : 'ascension';
      return Object.freeze({ id, ...endings[id] });
    }

    return Object.freeze({ initialState, normalize, inspect, choose, deriveEnding });
  }

  window.AetherStory = Object.freeze({ NPCS, NODES, ENDINGS, createEngine });
})();
