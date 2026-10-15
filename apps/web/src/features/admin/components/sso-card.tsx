import { zodResolver } from "@hookform/resolvers/zod";
import { SsoProviderInputSchema, type SsoProvider } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SectionCard } from "@/components/section-card";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AddIcon,
  ContentCopyIcon,
  DeleteIcon,
  DnsIcon,
  InfoIcon,
  PendingIcon,
  VerifiedIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetaChip } from "@/components/ui/meta-chip";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SSO_ENDPOINTS as E } from "@/features/admin/api/sso.api";
import {
  ssoSettingsQuery,
  useAddSsoProvider,
  useRemoveSsoProvider,
  useSetSsoEnforcement,
  useVerifySsoProvider,
} from "@/features/admin/api/sso.queries";

const TYPE_LABEL: Record<SsoProvider["type"], string> = { oidc: "OIDC", saml: "SAML 2.0" };

/**
 * Company single sign-on: connect an identity provider per email domain, prove the domain with a
 * DNS TXT record, then optionally require SSO for everyone. Owners always keep a fallback sign-in.
 */
export function SsoCard() {
  const query = useQuery(ssoSettingsQuery());
  const enforce = useSetSsoEnforcement();
  const switchId = useId();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SsoProvider | null>(null);
  const data = query.data;
  const available = data?.available ?? false;
  const anyVerified = data?.providers.some((provider) => provider.domainVerified) ?? false;

  return (
    <SectionCard
      title="Single sign-on"
      endpoint={E.settings.path}
      status={query}
      action={
        <Button size="sm" disabled={!available} onClick={() => setAdding(true)}>
          <AddIcon aria-hidden /> Add SSO connection
        </Button>
      }
    >
      {data && !available ? (
        <Banner
          tone="info"
          icon={<InfoIcon aria-hidden />}
          title="Single sign-on needs real sign-in"
          description="This API runs in development mode without sign-in. Set AUTH_MODE=accounts on the API to connect an identity provider."
        />
      ) : null}
      {data?.providers.length ? (
        <ul className="flex flex-col gap-0.5">
          {data.providers.map((provider) => (
            <ProviderItem
              key={provider.providerId}
              provider={provider}
              disabled={!available}
              onRemove={() => setRemoving(provider)}
            />
          ))}
        </ul>
      ) : available ? (
        <p className="text-sm text-on-surface-variant">
          No identity provider connected yet. Connect Okta, Microsoft Entra ID, Google Workspace or
          any OIDC or SAML 2.0 provider so people sign in with their work account.
        </p>
      ) : null}
      <label
        htmlFor={switchId}
        className="flex items-center justify-between gap-3 rounded-md bg-pane px-3.5 py-3"
      >
        <span className="flex flex-col">
          <span className="text-sm font-medium">Require SSO for everyone</span>
          <span className="text-xs text-on-surface-variant">
            {anyVerified
              ? "Members must sign in through your identity provider. Owners keep their other sign-in methods as a fallback."
              : "Verify a connection’s domain first. Owners always keep a fallback sign-in."}
          </span>
        </span>
        <Switch
          id={switchId}
          checked={data?.enforced ?? false}
          disabled={!available || !anyVerified || enforce.isPending}
          onCheckedChange={(on) =>
            enforce.mutate(on, {
              onSuccess: () =>
                toast.success(on ? "Single sign-on is now required" : "Single sign-on is optional"),
              onError: (error) => toast.error(error.message),
            })
          }
        />
      </label>
      <AddSsoDialog open={adding} onOpenChange={setAdding} />
      <RemoveSsoDialog
        provider={removing}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
      />
    </SectionCard>
  );
}

function ProviderItem({
  provider,
  disabled,
  onRemove,
}: {
  provider: SsoProvider;
  disabled: boolean;
  onRemove: () => void;
}) {
  const verify = useVerifySsoProvider();
  const sp = provider.serviceProvider;
  return (
    <li className="flex flex-col gap-3 rounded-xs bg-pane px-4 py-3.5 first:rounded-t-[20px] last:rounded-b-[20px]">
      <span className="flex flex-wrap items-center gap-2">
        <b className="text-sm font-medium">{provider.domain}</b>
        <MetaChip tone="outline">{TYPE_LABEL[provider.type]}</MetaChip>
        {provider.domainVerified ? (
          <StatusChip tone="success" icon={<VerifiedIcon />}>
            Verified
          </StatusChip>
        ) : (
          <StatusChip tone="warning" icon={<PendingIcon />}>
            Unverified
          </StatusChip>
        )}
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto text-error"
          aria-label={`Remove ${provider.domain}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <DeleteIcon aria-hidden /> Remove
        </Button>
      </span>
      {provider.domainVerified ? null : (
        <div className="flex flex-col gap-2">
          <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
            <DnsIcon className="mt-px size-4 shrink-0" aria-hidden />
            Add this TXT record to {provider.domain}’s DNS, then verify. Sign-in through this
            connection starts once the domain is verified.
          </p>
          <CopyField label="TXT record name" value={provider.verification.name} />
          <CopyField label="TXT record value" value={provider.verification.value} />
          <span className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || verify.isPending}
              onClick={() =>
                verify.mutate(provider.providerId, {
                  onSuccess: () => toast.success(`${provider.domain} verified`),
                })
              }
            >
              {verify.isPending ? <Spinner /> : null}
              Verify domain
            </Button>
            {verify.isError ? (
              <span role="alert" className="flex-1 text-xs text-error">
                {verify.error.message}
              </span>
            ) : null}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-on-surface-variant">
          Enter in your identity provider
        </span>
        {provider.type === "oidc" ? (
          <CopyField label="Redirect URI" value={sp.callbackUrl} />
        ) : (
          <>
            <CopyField label="ACS URL" value={sp.callbackUrl} />
            {sp.entityId ? <CopyField label="SP entity ID" value={sp.entityId} /> : null}
            {sp.metadataUrl ? <CopyField label="Metadata URL" value={sp.metadataUrl} /> : null}
          </>
        )}
      </div>
    </li>
  );
}

/** A labelled monospace value with a copy button. */
function CopyField({ label, value }: { label: string; value: string }) {
  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Could not copy to the clipboard"));
  };
  return (
    <div className="flex items-center gap-2">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs text-on-surface-variant">{label}</span>
        <code className="rounded-[6px] bg-surface-container-high px-2 py-1 font-mono text-[13px] leading-5 [overflow-wrap:anywhere]">
          {value}
        </code>
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        className="self-end"
        aria-label={`Copy ${label}`}
        onClick={copy}
      >
        <ContentCopyIcon aria-hidden />
      </Button>
    </div>
  );
}

/** Form-level schema: one flat set of inputs, narrowed to the chosen type before the API's check. */
const FormSchema = z
  .object({
    type: z.enum(["oidc", "saml"]),
    domain: z.string(),
    issuer: z.string(),
    clientId: z.string(),
    clientSecret: z.string(),
    entryPoint: z.string(),
    entityId: z.string(),
    certificate: z.string(),
  })
  .transform(({ type, domain, ...fields }) =>
    type === "oidc"
      ? {
          type,
          domain,
          issuer: fields.issuer,
          clientId: fields.clientId,
          clientSecret: fields.clientSecret,
        }
      : {
          type,
          domain,
          entryPoint: fields.entryPoint,
          entityId: fields.entityId,
          certificate: fields.certificate,
        },
  )
  .pipe(SsoProviderInputSchema);
type FormInput = z.input<typeof FormSchema>;
type FieldName = Exclude<keyof FormInput, "type">;

/** Per-field copy; the shown error is the field's own hint, except the domain's format message. */
const FIELDS: Record<
  FieldName,
  { label: string; placeholder?: string; error: string; secret?: boolean }
> = {
  domain: { label: "Email domain", placeholder: "company.com", error: "" },
  issuer: {
    label: "Issuer URL",
    placeholder: "https://login.company.com",
    error: "Enter the issuer URL, including https://",
  },
  clientId: { label: "Client ID", error: "Enter the client ID." },
  clientSecret: { label: "Client secret", error: "Enter the client secret.", secret: true },
  entryPoint: {
    label: "Single sign-on URL",
    placeholder: "https://company.okta.com/app/…/sso/saml",
    error: "Enter the identity provider’s sign-on URL, including https://",
  },
  entityId: { label: "Identity provider entity ID", error: "Enter the entity ID (issuer)." },
  certificate: {
    label: "Signing certificate",
    placeholder: "-----BEGIN CERTIFICATE-----",
    error: "Paste the identity provider’s signing certificate.",
  },
};

/** Connect an identity provider: OIDC (issuer + client) or SAML 2.0 (sign-on URL + certificate). */
function AddSsoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open ? <AddSsoForm close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddSsoForm({ close }: { close: () => void }) {
  const add = useAddSsoProvider();
  const id = useId();
  const form = useForm<FormInput, unknown, z.output<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      type: "oidc",
      domain: "",
      issuer: "",
      clientId: "",
      clientSecret: "",
      entryPoint: "",
      entityId: "",
      certificate: "",
    },
  });
  const type = useWatch({ control: form.control, name: "type" });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    add.mutate(values, {
      onSuccess: (provider) => {
        toast.success(
          provider.domainVerified
            ? `Connected ${provider.domain}`
            : `Connected ${provider.domain}. Verify the domain to turn it on.`,
        );
        close();
      },
    }),
  );

  const field = (name: FieldName) => {
    const meta = FIELDS[name];
    const error = errors[name];
    const fieldId = `${id}-${name}`;
    return (
      <div key={name} className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{meta.label}</Label>
        {name === "certificate" ? (
          <Textarea
            id={fieldId}
            className="font-mono text-xs"
            placeholder={meta.placeholder}
            aria-invalid={!!error}
            {...form.register(name)}
          />
        ) : (
          <Input
            id={fieldId}
            type={meta.secret ? "password" : "text"}
            autoComplete="off"
            placeholder={meta.placeholder}
            aria-invalid={!!error}
            {...form.register(name)}
          />
        )}
        {error ? (
          <p className="text-xs text-error">{name === "domain" ? error.message : meta.error}</p>
        ) : null}
      </div>
    );
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Add SSO connection</DialogTitle>
        <DialogDescription>
          People with an email at this domain sign in through your identity provider once the domain
          is verified.
        </DialogDescription>
      </DialogHeader>
      {add.isError ? (
        <Banner tone="error" title="Could not add the connection" description={add.error.message} />
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Protocol</legend>
        <OptionList orientation="horizontal">
          <OptionTile
            className="flex-1"
            input={<input type="radio" value="oidc" {...form.register("type")} />}
            title="OIDC"
            description="Okta, Microsoft Entra ID, Google Workspace, Auth0"
          />
          <OptionTile
            className="flex-1"
            input={<input type="radio" value="saml" {...form.register("type")} />}
            title="SAML 2.0"
            description="Any SAML identity provider, such as ADFS or OneLogin"
          />
        </OptionList>
      </fieldset>
      {field("domain")}
      {type === "oidc"
        ? (["issuer", "clientId", "clientSecret"] as const).map(field)
        : (["entryPoint", "entityId", "certificate"] as const).map(field)}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? <Spinner /> : null}
          Add connection
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Confirm before removing a connection; its SSO sign-ins stop working at once. */
function RemoveSsoDialog({
  provider,
  onOpenChange,
}: {
  provider: SsoProvider | null;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useRemoveSsoProvider();
  return (
    <Dialog open={provider !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {provider ? (
          <>
            <DialogHeader>
              <DialogTitle>Remove the {provider.domain} connection?</DialogTitle>
              <DialogDescription>
                People at {provider.domain} can no longer sign in with single sign-on. If this is
                the last verified connection, Require SSO turns off.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(provider.providerId, {
                    onSuccess: () => {
                      toast.success(`Removed ${provider.domain}`);
                      onOpenChange(false);
                    },
                    onError: (error) => toast.error(error.message),
                  })
                }
              >
                Remove
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
