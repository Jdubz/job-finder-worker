"""Prompt templates for AI job matching and analysis."""

from typing import Any, Dict

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
                    for achievement in exp.achievements[:3]:  # Top 3
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

            # Add Portland location preference (always include for visibility)
            lines.append(f"**Location:** Portland, OR (prefers local or remote positions)")

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
    def analyze_job_match(profile: Profile, job: Dict[str, Any]) -> str:
        """
        Create prompt to analyze job match against profile.

        Args:
            profile: User profile.
            job: Job posting dictionary.

        Returns:
            Formatted prompt string.
        """
        profile_summary = JobMatchPrompts.build_profile_summary(profile)

        prompt = f"""You are a concise job-match assistant. Summarize how the candidate fits this role and give only the guidance needed to tailor a resume and cover letter.

{profile_summary}

# Job Posting

**Title:** {job.get('title', 'N/A')}
**Company:** {job.get('company', 'N/A')}
**Location:** {job.get('location', 'N/A')}
**Salary:** {job.get('salary', 'Not specified')}
**Description:**
{job.get('description', 'N/A')}
{f'''
**Company Information:**
{job.get('company_info', '')}
''' if job.get('company_info') else ''}

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
}}
"""
        return prompt

    @staticmethod
    def generate_resume_intake_data(
        profile: Profile, job: Dict[str, Any], match_analysis: Dict[str, Any]
    ) -> str:
        """
        Create prompt to generate resume intake data for this specific job.

        Args:
            profile: User profile.
            job: Job posting dictionary.
            match_analysis: Previous match analysis results.

        Returns:
            Formatted prompt string.
        """
        profile_summary = JobMatchPrompts.build_profile_summary(profile)

        prompt = f"""You are an expert resume writer and ATS (Applicant Tracking System) optimization specialist. Create a detailed resume customization guide for this specific job application.

{profile_summary}

# Job Posting

**Title:** {job.get('title', 'N/A')}
**Company:** {job.get('company', 'N/A')}
**Description:**
{job.get('description', 'N/A')}
{f'''
**Company Information:**
{job.get('company_info', '')}
''' if job.get('company_info') else ''}
# Match Analysis

**Matched Skills:** {', '.join(match_analysis.get('matched_skills', []))}
**Missing Skills:** {', '.join(match_analysis.get('missing_skills', []))}
**Key Strengths:** {', '.join(match_analysis.get('key_strengths', []))}
**Potential Concerns:** {', '.join(match_analysis.get('potential_concerns', []))}

# Resume Customization Task

Generate specific, actionable guidance for tailoring the resume to THIS job. Focus on ATS optimization and relevance.

## Requirements:

1. **Target Summary** (2-3 sentences)
   - Emphasize skills and experience MOST relevant to this role
   - Include key technologies from the job title
   - Mention years of experience if it matches seniority level
   - Use power words and quantifiable achievements

2. **Skills Priority** (Ordered list)
   - List ALL matched skills in priority order
   - Put title-mentioned skills FIRST
   - Group related technologies together
   - Exclude skills not relevant to this role

3. **Experience Highlights**
   - For EACH relevant work experience, specify:
     * Which bullet points to emphasize/modify
     * Specific metrics or achievements to highlight
     * Technologies to mention prominently
     * How to reframe responsibilities to match job requirements

4. **Projects to Include**
   - List 2-3 most relevant projects
   - For each: explain WHY it's relevant
   - Suggest specific points to emphasize

5. **Achievement Angles**
   - How to frame/reword achievements to align with job needs
   - Specific metrics to emphasize (scale, performance, impact)
   - Leadership/collaboration angles if relevant

6. **ATS Keywords**
   - Extract 10-15 critical keywords from job description
   - Include exact technology names (case-sensitive)
   - Include role-specific terminology
   - Include domain-specific terms

7. **Gap Mitigation** (If missing skills exist)
   - For each missing skill: suggest how to address or downplay the gap
   - Identify transferable skills to emphasize
   - Recommend cover letter talking points

## Quality Guidelines:

- Be SPECIFIC - reference actual experiences from profile
- Focus on RELEVANCE over quantity
- Use candidate's actual achievements and metrics
- Match the language/terminology used in job description
- Consider ATS keyword matching
- Ensure all recommendations are truthful (no fabrication)

Provide your intake data in the following JSON format:

{{
  "job_id": "{job.get('url', 'unknown')}",
  "job_title": "{job.get('title', '')}",
  "company": "{job.get('company', '')}",
  "target_summary": "Results-driven software engineer with 5+ years...",
  "skills_priority": [
    "Python",
    "Django",
    "REST APIs",
    "PostgreSQL",
    "Docker"
  ],
  "experience_highlights": [
    {{
      "company": "Company Name",
      "title": "Software Engineer",
      "points_to_emphasize": [
        "Led development of microservices architecture",
        "Built RESTful APIs serving 1M+ requests/day"
      ]
    }}
  ],
  "projects_to_include": [
    {{
      "name": "Project Name",
      "why_relevant": "Demonstrates API development skills",
      "points_to_highlight": [
        "Built with Python and Django",
        "Scaled to handle 10k concurrent users"
      ]
    }}
  ],
  "achievement_angles": [
    "Emphasize scalability and performance",
    "Highlight team leadership",
    "Focus on API development expertise"
  ],
  "ats_keywords": [
    "Python",
    "Django",
    "RESTful APIs",
    "microservices",
    "PostgreSQL",
    "Docker",
    "Kubernetes",
    "CI/CD",
    "Agile",
    "Scrum"
  ],
  "gap_mitigation": [
    {{
      "missing_skill": "Kubernetes",
      "mitigation_strategy": "Emphasize Docker and container experience as transferable",
      "cover_letter_point": "Express enthusiasm for expanding Kubernetes expertise"
    }}
  ]
}}

Respond ONLY with valid JSON, no additional text.
"""
        return prompt
