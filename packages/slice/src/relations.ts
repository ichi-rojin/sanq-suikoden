// 責務: 感情台帳。イベントを人間関係の変化へ翻訳する唯一の交換台（怨恨・恩義は原因イベントIDごと保存する）
import type { Officer, OfficerId, World, WorldEvent } from "./model";
import { getRelation, livingOfficers } from "./model";

const AFFINITY_MIN = -100;
const AFFINITY_MAX = 100;

export function adjustRelation(
  officer: Officer,
  target: OfficerId,
  dAffinity: number,
  dTrust: number,
): void {
  if (officer.id === target) {
    return;
  }
  const rel = getRelation(officer, target);
  rel.affinity = Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, rel.affinity + dAffinity));
  rel.trust = Math.max(0, Math.min(100, rel.trust + dTrust));
}

export function addGrudge(officer: Officer, target: OfficerId, eventId: string, dAffinity: number): void {
  if (officer.id === target) {
    return;
  }
  const rel = getRelation(officer, target);
  rel.grudges.push(eventId);
  adjustRelation(officer, target, dAffinity, -15);
}

export function addDebt(officer: Officer, target: OfficerId, eventId: string, dAffinity: number): void {
  if (officer.id === target) {
    return;
  }
  const rel = getRelation(officer, target);
  rel.debts.push(eventId);
  adjustRelation(officer, target, dAffinity, 12);
}

export function swearOath(a: Officer, b: Officer): void {
  const relA = getRelation(a, b.id);
  const relB = getRelation(b, a.id);
  relA.bond = "sworn";
  relB.bond = "sworn";
  relA.affinity = Math.max(relA.affinity, 78);
  relB.affinity = Math.max(relB.affinity, 78);
  relA.trust = Math.max(relA.trust, 72);
  relB.trust = Math.max(relB.trust, 72);
}

export function friendsOf(world: World, officerId: OfficerId): Officer[] {
  return livingOfficers(world).filter((other) => {
    if (other.id === officerId) {
      return false;
    }
    const rel = other.rel.get(officerId);
    return rel !== undefined && (rel.affinity >= 50 || rel.bond !== undefined);
  });
}

function officer(world: World, id: unknown): Officer | undefined {
  return typeof id === "string" ? world.officers.get(id) : undefined;
}

// イベント→感情の翻訳表。ここが「出来事が人生に残る」仕組みの心臓部
export function applyEventEmotions(world: World, event: WorldEvent): void {
  const d = event.data;
  switch (event.kind) {
    case "clash.stray":
    case "clash.burn": {
      const victim = officer(world, d["victim"]);
      const culprit = typeof d["culprit"] === "string" ? (d["culprit"] as string) : undefined;
      if (victim !== undefined && culprit !== undefined) {
        const allySide = d["victimSide"] === "ally";
        addGrudge(victim, culprit, event.id, allySide ? -35 : -15);
      }
      break;
    }
    case "clash.rescue": {
      const saved = officer(world, d["saved"]);
      const savior = typeof d["savior"] === "string" ? (d["savior"] as string) : undefined;
      if (saved !== undefined && savior !== undefined) {
        addDebt(saved, savior, event.id, 30);
      }
      break;
    }
    case "clash.duel-respect": {
      const [a, b] = event.actors;
      const oa = officer(world, a);
      const ob = officer(world, b);
      if (oa !== undefined && ob !== undefined) {
        adjustRelation(oa, ob.id, 22, 15);
        adjustRelation(ob, oa.id, 22, 15);
      }
      break;
    }
    case "clash.duel":
    case "life.duel": {
      const loser = officer(world, d["loser"]);
      const winner = typeof d["winner"] === "string" ? (d["winner"] as string) : undefined;
      if (loser !== undefined && winner !== undefined) {
        if (loser.values.face >= 70) {
          addGrudge(loser, winner, event.id, -20);
        } else {
          adjustRelation(loser, winner, -8, 0);
        }
      }
      break;
    }
    case "clash.fall":
    case "life.revenge": {
      const dead = typeof d["victim"] === "string" ? (d["victim"] as string) : undefined;
      const killer = typeof d["killer"] === "string" ? (d["killer"] as string) : undefined;
      if (dead !== undefined && killer !== undefined) {
        for (const friend of friendsOf(world, dead)) {
          addGrudge(friend, killer, event.id, -40);
        }
      }
      break;
    }
    case "life.execute": {
      const victim = typeof d["victim"] === "string" ? (d["victim"] as string) : undefined;
      const orderer = typeof d["orderer"] === "string" ? (d["orderer"] as string) : undefined;
      if (victim !== undefined && orderer !== undefined) {
        for (const friend of friendsOf(world, victim)) {
          addGrudge(friend, orderer, event.id, -45);
        }
      }
      break;
    }
    case "war.plunder": {
      const leader = typeof d["leader"] === "string" ? (d["leader"] as string) : undefined;
      if (leader !== undefined && event.loc !== undefined) {
        for (const local of livingOfficers(world)) {
          if (local.homeLoc === event.loc && local.id !== leader) {
            addGrudge(local, leader, event.id, -30);
          }
        }
      }
      break;
    }
    case "life.frame": {
      const victim = officer(world, d["victim"]);
      const orderer = typeof d["orderer"] === "string" ? (d["orderer"] as string) : undefined;
      if (victim !== undefined && orderer !== undefined) {
        addGrudge(victim, orderer, event.id, -60);
        for (const friend of friendsOf(world, victim.id)) {
          addGrudge(friend, orderer, event.id, -25);
        }
      }
      break;
    }
    case "life.quarrel": {
      const [a, b] = event.actors;
      const oa = officer(world, a);
      const ob = officer(world, b);
      if (oa !== undefined && ob !== undefined) {
        if (d["deep"] === true) {
          addGrudge(oa, ob.id, event.id, -22);
          addGrudge(ob, oa.id, event.id, -22);
        } else {
          adjustRelation(oa, ob.id, -15, -10);
          adjustRelation(ob, oa.id, -15, -10);
        }
      }
      break;
    }
    case "life.feast": {
      for (const a of event.actors) {
        for (const b of event.actors) {
          if (a !== b) {
            const oa = officer(world, a);
            if (oa !== undefined) {
              adjustRelation(oa, b, 6, 4);
            }
          }
        }
      }
      break;
    }
    case "life.oath": {
      for (let i = 0; i < event.actors.length; i += 1) {
        for (let j = i + 1; j < event.actors.length; j += 1) {
          const oa = officer(world, event.actors[i]);
          const ob = officer(world, event.actors[j]);
          if (oa !== undefined && ob !== undefined) {
            swearOath(oa, ob);
          }
        }
      }
      break;
    }
    case "life.rescue-convoy":
    case "life.jailbreak": {
      const prisoner = officer(world, d["prisoner"]);
      const rescuer = typeof d["rescuer"] === "string" ? (d["rescuer"] as string) : undefined;
      if (prisoner !== undefined && rescuer !== undefined) {
        addDebt(prisoner, rescuer, event.id, 35);
      }
      break;
    }
    case "life.release": {
      const released = officer(world, d["released"]);
      const captor = typeof d["captor"] === "string" ? (d["captor"] as string) : undefined;
      if (released !== undefined && captor !== undefined) {
        addDebt(released, captor, event.id, 32);
      }
      break;
    }
    case "clash.taunt": {
      const target = officer(world, d["target"]);
      const taunter = typeof d["taunter"] === "string" ? (d["taunter"] as string) : undefined;
      if (target !== undefined && taunter !== undefined) {
        addGrudge(target, taunter, event.id, -12);
      }
      break;
    }
    case "clash.knockback": {
      const target = officer(world, d["target"]);
      const attacker = typeof d["attacker"] === "string" ? (d["attacker"] as string) : undefined;
      if (target !== undefined && attacker !== undefined) {
        adjustRelation(target, attacker, -10, -5);
      }
      break;
    }
    case "life.join":
    case "life.recruit": {
      const joiner = officer(world, d["joiner"]);
      const leader = typeof d["leader"] === "string" ? (d["leader"] as string) : undefined;
      if (joiner !== undefined && leader !== undefined) {
        adjustRelation(joiner, leader, 15, 12);
      }
      break;
    }
    case "agit.extortion": {
      const leader = typeof d["leader"] === "string" ? (d["leader"] as string) : undefined;
      if (leader !== undefined && event.loc !== undefined) {
        for (const local of livingOfficers(world)) {
          if (local.loc === event.loc && local.values.altruism >= 65 && local.id !== leader) {
            addGrudge(local, leader, event.id, -15);
          }
        }
      }
      break;
    }
    default:
      break;
  }
}
