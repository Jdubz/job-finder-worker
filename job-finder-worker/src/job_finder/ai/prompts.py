"""Prompt templates for AI job matching and analysis.

Prompt functions return PromptPair (system, user) to enable:
- Clear separation of general instructions (system) from per-request context (user)
- Prompt caching on providers that support it when the system prompt is stable for a use case
- Better instruction following on local models (clear system/user separation)
"""

from typing import Any, Dict

from job_finder.ai.extraction_prompts import PromptPair
from job_finder.profile.schema import Profile


class JobMatchPrompts:
    """Prompt templates for job matching tasks."""

    @staticmethod
    def build_profile_summary(profile: Profile) -> str:
        """
        Build a comprehensive profile summary for prompts.

        Args:
            profile: User profile.

        Returns:
            Formatted profile summary string.
        """
        lines = [f"# Candidate Profile: {profile.name}\n"]

        # Location and Languages (if available)
        metadata = []
        if profile.location:
            metadata.append(f"**Location:** {profile.location}")
        if profile.languages:
            metadata.append(f"**Languages:** {', '.join(profile.languages)}")
        if metadata:
            lines.extend(metadata)
            lines.append("")

        # Professional Summary
        if profile.summary:
            lines.append(f"## Professional Summary\n{profile.summary}\n")

        # Experience Overview
        if profile.years_of_experience:
            lines.append(f"## Experience Overview")
            lines.append(f"Total Years: {profile.years_of_experience}")

            # Current role
            current = profile.get_current_role()
            if current:
                lines.append(f"Current Role: {current.title} at {current.company}")
            lines.append("")

        # Skills (with levels and years)
        if profile.skills:
            lines.append("## Technical Skills")

            # Group by level if available
            expert_skills = [s for s in profile.skills if s.level and "expert" in s.level.lower()]
            advanced_skills = [
                s for s in profile.skills if s.level and "advanced" in s.level.lower()
            ]
            intermediate_skills = [
                s for s in profile.skills if s.level and "intermediate" in s.level.lower()
            ]
            other_skills = [
                s
                for s in profile.skills
                if not s.level or s.level.lower() not in ["expert", "advanced", "intermediate"]
            ]

            if expert_skills:
                lines.append("**Expert:**")
                for skill in expert_skills:
                    exp_str = f" ({skill.years_experience} years)" if skill.years_experience else ""
                    lines.append(f"  - {skill.name}{exp_str}")

            if advanced_skills:
                lines.append("**Advanced:**")
                for skill in advanced_skills:
                    exp_str = f" ({skill.years_experience} years)" if skill.years_experience else ""
                    lines.append(f"  - {skill.name}{exp_str}")

            if intermediate_skills:
                lines.append("**Intermediate:**")
                for skill in intermediate_skills:
                    exp_str = f" ({skill.years_experience} years)" if skill.years_experience else ""
                    lines.append(f"  - {skill.name}{exp_str}")

            if other_skills:
                lines.append("**Other Skills:**")
                skill_names = [
                    (f"{s.name} ({s.years_experience} years)" if s.years_experience else s.name)
                    for s in other_skills
                ]
                lines.append("  " + ", ".join(skill_names))

            lines.append("")

        # Recent work experience with responsibilities and achievements
        if profile.experience:
            lines.append("## Work Experience (Recent)")
            for exp in profile.experience[:3]:  # Top 3 most recent
                duration = f"{exp.start_date} - {exp.end_date or 'Present'}"
                lines.append(f"\n### {exp.title} at {exp.company}")
                lines.append(f"*{duration}*")

                if exp.description:
                    lines.append(f"{exp.description}")

                if exp.responsibilities:
                    lines.append("**Responsibilities:**")
                    for resp in exp.responsibilities[:4]:  # Top 4 responsibilities
                        lines.append(f"  - {resp}")

                if exp.achievements:
                    lines.append("**Key Achievements:**")
                    for achievement in exp.achievements[:5]:  # Top 5 (includes project highlights)
                        lines.append(f"  - {achievement}")

                if exp.technologies:
                    lines.append(f"**Technologies:** {', '.join(exp.technologies)}")
            lines.append("")

        # Notable Projects
        if profile.projects:
            lines.append("## Notable Projects")
            for proj in profile.projects[:2]:  # Top 2
                lines.append(f"\n### {proj.name}")
                lines.append(f"{proj.description}")
                if proj.technologies:
                    lines.append(f"**Technologies:** {', '.join(proj.technologies)}")
                if proj.highlights:
                    lines.append("**Highlights:**")
                    for highlight in proj.highlights[:2]:
                        lines.append(f"  - {highlight}")
            lines.append("")

        # Education
        if profile.education:
            lines.append("## Education")
            for edu in profile.education:
                degree_str = (
                    f"{edu.degree} in {edu.field_of_study}" if edu.field_of_study else edu.degree
                )
                lines.append(f"- {degree_str} from {edu.institution}")
                if edu.honors:
                    lines.append(f"  Honors: {', '.join(edu.honors)}")
            lines.append("")

        # Certifications
        if profile.certifications:
            lines.append("## Certifications")
            lines.append(", ".join(profile.certifications))
            lines.append("")

        # Job Search Preferences
        if profile.preferences:
            prefs = profile.preferences
            lines.append("## Job Search Preferences")

            if profile.location:
                lines.append(f"**Location:** {profile.location}")

            if prefs.desired_roles:
                lines.append(f"**Desired Roles:** {', '.join(prefs.desired_roles)}")
            if prefs.remote_preference:
                lines.append(f"**Remote Preference:** {prefs.remote_preference}")
            if prefs.min_salary or prefs.max_salary:
                salary_range = ""
                if prefs.min_salary and prefs.max_salary:
                    salary_range = f"${prefs.min_salary:,} - ${prefs.max_salary:,}"
                elif prefs.min_salary:
                    salary_range = f"${prefs.min_salary:,}+"
                elif prefs.max_salary:
                    salary_range = f"Up to ${prefs.max_salary:,}"
                lines.append(f"**Salary Range:** {salary_range}")
            if prefs.employment_types:
                lines.append(f"**Employment Types:** {', '.join(prefs.employment_types)}")
            if prefs.industries:
                lines.append(f"**Preferred Industries:** {', '.join(prefs.industries)}")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def analyze_job_match(profile: Profile, job: Dict[str, Any]) -> PromptPair:
        """
        Create prompt pair to analyze job match against profile.

        Args:
            profile: User profile.
            job: Job posting dictionary.

        Returns:
            PromptPair of (system_prompt, user_prompt).
        """
        profile_summary = JobMatchPrompts.build_profile_summary(profile)

        system = f"""You are a concise job-match assistant. Summarize how the candidate fits this role and give only the guidance needed to tailor a resume and cover letter.

{profile_summary}

# Deliverables (be brief and factual)

1) matched_skills: skills the candidate already has that are explicitly relevant (max 12)
2) missing_skills: real gaps or weak areas (max 8)
3) experience_match: 1-2 sentences on seniority/domain fit
4) key_strengths: 3-5 bullets that would impress this hiring team
5) potential_concerns: concrete risks/gaps the candidate should address
6) customization_recommendations:
   - resume_focus: 3-5 bullets to emphasize on the resume for THIS job
   - cover_letter_points: 2-4 talking points to address gaps or motivation
   - keywords: 8-12 ATS keywords from the posting (exact casing)

# Rules:
- Use only information from the profile and posting; do not invent facts.
- Keep bullets short (8-14 words) and specific.
- Do not score or rank the job; deterministic scoring is handled elsewhere.

Return ONLY valid JSON in this shape (no prose, no markdown):
{{
  "matched_skills": [],
  "missing_skills": [],
  "experience_match": "",
  "key_strengths": [],
  "potential_concerns": [],
  "customization_recommendations": {{
    "resume_focus": [],
    "cover_letter_points": [],
    "keywords": []
  }}
}}"""

        user = f"""# Job Posting

**Title:** {job.get('title', 'N/A')}
**Company:** {job.get('company', 'N/A')}
**Location:** {job.get('location', 'N/A')}
**Salary:** {job.get('salary', 'Not specified')}
**Description:**
{job.get('description', 'N/A')}
{f'''
**Company Information:**
{job.get('company_info', '')}
''' if job.get('company_info') else ''}"""

        return (system, user)
