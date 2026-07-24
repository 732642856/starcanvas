import type { LocalSkillMetadata } from "./contracts.ts";

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 2));
}

export function suggestLocalSkillsForCrew(
  skills: LocalSkillMetadata[],
  task: string,
  maxSkills = 3,
): string[] {
  const taskTerms = terms(task);
  return skills
    .map((skill) => {
      const haystack = terms([skill.name, skill.description, ...skill.tags].join(" "));
      const score = [...taskTerms].reduce((total, term) => total + (haystack.has(term) ? 1 : 0), 0);
      return { skill, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.skill.skillId.localeCompare(b.skill.skillId))
    .slice(0, Math.max(0, maxSkills))
    .map(({ skill }) => skill.skillId);
}
