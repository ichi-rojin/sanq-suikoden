// 責務: WorldPack型ツリーの逐条突合テスト（C-08）。パックスキーマ設計書§2の全10節が型に対応することを確認する
import { describe, expect, it } from "vitest";
import {
  asAgentId,
  asAgitationId,
  asCauseId,
  asCommunityId,
  asInstitutionId,
  asNodeId,
  asPackId,
  asPostId,
  asSkillId,
  asVocabKey,
} from "../shared/ids";
import { asScore100 } from "../shared/score100";
import type { WorldPack } from "./world-pack";

const SCHEMA_SECTIONS = [
  "meta",
  "geography",
  "agents",
  "institutions",
  "skills",
  "causes",
  "agitation",
  "vocabulary",
  "eraParams",
  "evaluationOverrides",
] as const;

describe("WorldPack §2 逐条突合", () => {
  it("covers all 10 schema sections with a constructible instance", () => {
    const score = 50;

    const pack: WorldPack = {
      meta: {
        packId: asPackId("fixtures.roundtrip"),
        packName: "逐条突合テスト用",
        version: "0.0.0",
        engineSchemaVersion: "1.0",
      },
      geography: {
        nodes: [
          {
            id: asNodeId("node.a"),
            nodeType: "県城",
            wealth: asScore100(score),
            population: asScore100(score),
            publicOrder: asScore100(score),
            sentiment: asScore100(score),
            enforcement: asScore100(score),
            defense: asScore100(score),
            encounterWeight: 1,
            regionTag: "east",
          },
        ],
        edges: [],
      },
      agents: {
        explicit: [
          {
            id: asAgentId("agent.a"),
            familyName: "石",
            givenName: "堅",
            origin: asVocabKey("vocab.origin.soldier"),
            startNode: asNodeId("node.a"),
            aptitudes: {
              valor: asScore100(score),
              intellect: asScore100(score),
              leadership: asScore100(score),
              charisma: asScore100(score),
              craft: asScore100(score),
            },
            values: {
              altruism: asScore100(score),
              loyalty: asScore100(score),
              ambition: asScore100(score),
              acquisition: asScore100(score),
              aggression: asScore100(score),
              caution: asScore100(score),
              face: asScore100(score),
              attachment: asScore100(score),
            },
            initialRelations: [],
            initialAssets: 0,
            initialFame: [],
            sourceNote: "架空",
          },
        ],
        archetypes: [],
        generation: {
          initialBackgroundCount: { min: 10, max: 20 },
          successionParams: {},
        },
      },
      institutions: [
        {
          id: asInstitutionId("inst.a"),
          nameRef: asVocabKey("vocab.inst.a"),
          jurisdiction: "全土",
          rules: [{ ruleKind: "課税", params: {} }],
          posts: [
            {
              id: asPostId("post.a"),
              nameRef: asVocabKey("vocab.post.a"),
              capacity: 1,
              salary: 1,
              actionTags: [],
              faceValue: asScore100(score),
            },
          ],
          corruption: asScore100(score),
          legitimacy: asScore100(score),
        },
      ],
      skills: [
        {
          id: asSkillId("skill.a"),
          nameRef: asVocabKey("vocab.skill.a"),
          composition: [{ primitive: "近接", params: {} }],
          acquisition: { rarity: "common" },
        },
      ],
      causes: [
        {
          id: asCauseId("cause.a"),
          nameRef: asVocabKey("vocab.cause.a"),
          valueProfile: {},
          hostilityTarget: "なし",
          legitimacyBase: "自衛",
        },
      ],
      agitation: [
        {
          id: asAgitationId("agit.a"),
          kind: "災害",
          nameRef: asVocabKey("vocab.agit.a"),
          target: "east",
          frequencyBand: { meanIntervalYears: 12 },
          intensity: {},
        },
      ],
      vocabulary: {
        personNames: { familyPool: [], givenRules: {} },
        nicknames: { rules: [] },
        titleTemplates: ["{地名}の{戦い|乱|変}"],
        speech: { entries: [] },
        chroniclerStyle: { tone: "plain" },
        displayNames: {},
        communities: [{ id: asCommunityId("community.a"), nameRef: asVocabKey("vocab.comm.a") }],
        entries: {},
      },
      eraParams: {
        lifespan: { mean: 55, stddev: 12 },
        moveSpeed: { foot: 1, horse: 3, boat: 2 },
        currency: "貫",
        banquetFrequency: 1.5,
      },
      evaluationOverrides: {
        permanent: { 不義の目撃: 2 },
        temporaryStates: { 飲酒: { axisMultipliers: { caution: 0.5 }, durationTicks: 1 } },
      },
    };

    const actualSections = Object.keys(pack).sort();
    expect(actualSections).toEqual([...SCHEMA_SECTIONS].sort());
  });
});
