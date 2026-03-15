<script lang="ts">
    import { getSignUpUrl } from '$lib/utils/dashboard';
    import { trackEvent } from '$lib/actions/analytics';
    import { Button } from '$lib/components/ui';
    import { cn } from '$lib/utils/cn';
    import { SHOW_SCALE_PLAN } from '$lib/constants/feature-flags';

    const plans: Array<{
        id: string;
        name: string;
        price: string;
        description: string;
        tag?: string;
        subtitle?: string;
        event: string;
        features?: string[];
        buttonText: string;
    }> = [
        {
            id: 'Free',
            name: 'Start for Free',
            price: '₹0',
            description: 'Get started with:',
            event: 'home-pricing-cards-free-click',
            buttonText: 'Get Started',
            subtitle: '/ month',
            features: [
                'Unlimited API requests',
                '50,000 monthly active users',
                '500 MB database size',
                '5 GB egress',
                '5 GB cached egress',
                '1 GB file storage',
                'Community support'
            ]
        },
        {
            id: 'Pro',
            name: 'Get Started',
            price: '₹2,499',
            description: 'Everything in the Free Plan, plus:',
            event: 'home-pricing-cards-pro-click',
            buttonText: 'Get Started',
            subtitle: '/ month',
            features: [
                '100,000 monthly active users',
                '8 GB disk size per project',
                '250 GB egress',
                '250 GB cached egress',
                '100 GB file storage',
                'Email support',
                'Daily backups stored for 7 days',
                '7-day log retention'
            ]
        },
        {
            id: 'Scale',
            name: 'Get Started',
            price: '₹49,999',
            description: 'Everything in the Pro Plan, plus:',
            event: 'home-pricing-cards-scale-click',
            buttonText: 'Get Started',
            subtitle: '/ month',
            features: [
                'SOC2',
                'Project-scoped and read-only access',
                'HIPAA available as paid add-on',
                'SSO for Supabase Dashboard',
                'Priority email support & SLAs',
                'Daily backups stored for 14 days',
                '28-day log retention',
                'Add Log Drains'
            ]
        },
        {
            id: 'Enterprise',
            name: 'Custom',
            price: 'Custom',
            description: 'Enterprise features:',
            event: 'home-pricing-cards-enterprise-click',
            buttonText: 'Contact Us',
            features: [
                'Designated Support manager',
                'Uptime SLAs',
                'BYO Cloud supported',
                '24x7x365 premium enterprise support',
                'Private Slack channel',
                'Custom Security Questionnaires'
            ]
        }
    ];

    type PricingProps = {
        class?: string;
    };

    const { class: className }: PricingProps = $props();

    // The user wants ALL 4 plans visible exactly like the image, so we overwrite the SHOW_SCALE_PLAN filter.
    const visiblePlans = plans;

    const gridCols = `lg:grid-cols-${visiblePlans.length}`;

    const DASHBOARD_URL = getSignUpUrl();
</script>

<div
    class={cn(
        'relative -mt-6 -mb-12 flex min-h-[650px] max-w-screen items-center justify-center overflow-hidden pt-40 md:mb-0 md:pb-10',
        className
    )}
>
    <div class="container flex w-full flex-col items-center justify-center gap-10">
        <div
            class={cn(
                'animate-lighting absolute top-0 left-0 -z-10 h-screen w-[200vw] -translate-x-[25%] translate-y-8 rotate-25 overflow-hidden blur-3xl md:w-full',
                'bg-[image:radial-gradient(ellipse_390px_50px_at_10%_30%,_rgba(254,_149,_103,_0.2)_0%,_rgba(254,_149,_103,_0)_70%),_radial-gradient(ellipse_1100px_170px_at_15%_40%,rgba(253,_54,_110,_0.08)_0%,_rgba(253,_54,_110,_0)_70%),_radial-gradient(ellipse_1200px_180px_at_30%_30%,_rgba(253,_54,_110,_0.08)_0%,_rgba(253,_54,_110,_0)_70%)]',
                'bg-position-[0%_0%]'
            )}
        ></div>

        <div
            class="animate-fade-in relative flex w-full flex-col gap-6 [animation-delay:150ms] [animation-duration:1000ms] lg:w-2/3"
        >
            <h2 class="text-[#fcad42] font-medium leading-[1.1] tracking-tight text-5xl md:text-6xl max-w-2xl text-balance">
                All-in-one infra for solo devs & SMBs<span class="text-white">_</span>
            </h2>

            <p class="text-white text-lg md:text-xl font-medium max-w-2xl leading-relaxed mt-2">
                Indobase is an open-source, developer infrastructure platform with Auth, Database, Storage, Functions, Realtime, SMS, Email, Push, and Hosting.
            </p>

            <div class="mt-4 flex">
                <Button
                    href={DASHBOARD_URL}
                    class="w-full! lg:w-fit! bg-gradient-to-r from-[#fcad42] to-[#fc5d5d] hover:opacity-90 text-white font-semibold px-6 py-6 rounded-lg border-0"
                    onclick={() => {
                        trackEvent(`pricing-get-started-click`);
                    }}>Start building for free</Button
                >
            </div>
        </div>

        <div
            class="grid w-[90%] md:w-[85%] lg:w-[1000px] xl:w-[1100px] grid-cols-1 md:grid-cols-2 lg:grid-cols-4 bg-[#1a1a1a] overflow-hidden rounded-[24px] border border-white/5 relative shadow-2xl"
        >
            {#each visiblePlans as { id, name, price, tag: label, subtitle, description, event, features, buttonText }, index (`${id},${label},${index}`)}
                {@const isEnterprise = id === 'Enterprise'}
                <div class={cn(
                    "flex flex-col gap-1 px-6 py-8 border-b border-white/5 lg:border-b-0",
                    index !== visiblePlans.length - 1 ? "lg:border-r lg:border-white/5" : ""
                )}>
                    <div class="flex items-center gap-2.5">
                        <span class="text-white text-lg font-medium tracking-normal leading-none">{name}</span>
                        {#if label}
                            <span
                                class="bg-accent-200 text-caption rounded-lg px-1.5 py-0.5 font-medium text-white"
                                >{label}</span
                            >
                        {/if}
                    </div>
                    <div class="flex flex-1 flex-col">
                        <span class={cn(
                            "text-[2.75rem] font-medium mt-4 mb-8 flex items-baseline gap-1 tracking-tight font-sans text-[#fcad42]"
                        )}>
                            {price}
                            {#if subtitle}
                                <span class="text-white text-[15px] font-normal"
                                    >{subtitle}</span
                                >
                            {/if}
                        </span>

                        <p class="text-white text-[13px] mt-2 mb-6 block font-medium leading-snug">
                            {description}
                        </p>

                        {#if features && features.length > 0}
                            <ul class="text-white text-[13px] mt-2 flex flex-col gap-3 font-normal mb-8">
                                {#each features as feature}
                                    <li class="flex items-start gap-2.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0 mt-[1px]"><path d="M20 6 9 17l-5-5"/></svg>
                                        <span class="flex-1 leading-snug tracking-normal">{feature}</span>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <a
                        href={isEnterprise ? '/contact-us/enterprise' : DASHBOARD_URL}
                        onclick={() => trackEvent(event)}
                        class={cn(
                            "mt-auto flex w-full items-center justify-center rounded-md px-4 py-2.5 text-[14px] font-semibold text-white transition-all",
                            isEnterprise 
                                ? "bg-transparent border border-white/10 hover:bg-white/5" 
                                : "bg-gradient-to-r from-[#fcad42] to-[#fc5d5d] hover:opacity-90"
                        )}
                    >
                        {buttonText}
                    </a>
                </div>
            {/each}
        </div>
    </div>
</div>
