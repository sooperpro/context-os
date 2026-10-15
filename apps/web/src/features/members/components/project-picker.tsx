import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { projectsQuery } from "@/features/projects/api/projects.queries";

/** Checkboxes for the workspace's projects: the ones a guest can see. */
export function ProjectPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const projects = useQuery(projectsQuery());
  if (projects.isPending)
    return <p className="text-sm text-on-surface-variant">Loading projects…</p>;
  if (projects.isError)
    return (
      <p className="text-sm text-destructive">Projects could not be loaded. Try again later.</p>
    );
  if (!projects.data.items.length)
    return <p className="text-sm text-on-surface-variant">There are no projects yet.</p>;
  return (
    <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
      {projects.data.items.map((project) => {
        const checked = value.includes(project.id);
        return (
          <li key={project.id}>
            <label
              htmlFor={`${id}-${project.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-container"
            >
              <input
                id={`${id}-${project.id}`}
                type="checkbox"
                className="size-4 accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={() =>
                  onChange(
                    checked
                      ? value.filter((entry) => entry !== project.id)
                      : [...value, project.id],
                  )
                }
              />
              {project.name}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
