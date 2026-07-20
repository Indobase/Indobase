<script lang="ts">
    import { getSignUpUrl } from '$lib/utils/dashboard';
    import { trackEvent } from '$lib/actions/analytics';
    import { Button } from '$lib/components/ui';
    import { cn } from '$lib/utils/cn';

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
            name: 'Free',
            price: '₹0',
            description: 'Try Indobase:',
            event: 'home-pricing-cards-free-click',
            buttonText: 'Start free',
            subtitle: '/ month',
            features: [
                'No Studio (Builder only)',
                '1 app',
                '*.indobase.app subdomain',
                'Indobase badge',
                '~20 AI builds/day',
                '500 MB database',
                '1 GB file storage',
                '10k MAU',
                '5 GB egress',
                'Sleeps after 7 days idle',
                'Community support'
            ]
        },
        {
            id: 'Basic',
            name: 'Basic',
            price: '₹499',
            description: 'Open Studio + your domain:',
            event: 'home-pricing-cards-basic-click',
            buttonText: 'Get Basic',
            subtitle: '/ month',
            features: [
                'Studio unlocked',
                'Auth, Database, Storage, Functions',
                '3 apps',
                '~50 AI builds/day',
                '1 GB database',
                '5 GB file storage',
                '25k MAU',
                '25 GB egress',
                'Custom domain',
                'Badge removed',
                'Sleeps after 30 days idle',
                'Email support (48h)'
            ]
        },
        {
            id: 'Pro',
            name: 'Pro',
            price: '₹1,999',
            description: 'Headroom for production apps:',
            tag: 'Popular',
            event: 'home-pricing-cards-pro-click',
            buttonText: 'Get Pro',
            subtitle: '/ month',
            features: [
                'Everything in Basic',
                '5 apps',
                '~150 AI builds/day',
                '8 GB database',
                '100 GB file storage',
                '100k MAU',
                '250 GB egress',
                'Sleeps after 30 days idle (pin to keep warm)',
                'GitHub export',
                'Isolated tenant stack'
            ]
        },
        {
            id: 'Studio',
            name: 'Studio',
            price: '₹6,999',
            description: 'Team — seats and shared billing:',
            event: 'home-pricing-cards-studio-click',
            buttonText: 'Get Studio',
            subtitle: '/ month',
            features: [
                'Everything in Pro',
                '15 apps',
                '3 seats',
                '~300 AI builds/day',
                '20 GB database',
                '250 GB file storage',
                '500 GB egress',
                'No idle sleep',
                'Priority build queue',
                'Shared billing',
                'Priority support'
            ]
        },
        {
            id: 'Enterprise',
            name: 'Enterprise',
            price: 'Custom',
            description: 'From ₹40,000/mo:',
            event: 'home-pricing-cards-enterprise-click',
            buttonText: 'Contact Us',
            features: [
                'DPDP audit pack',
                'Uptime SLA',
                'Dedicated placement / VPC',
                'SSO',
                '24×7 premium support'
            ]
        }
    ];

    type PricingProps = {
        class?: string;
    };

    const { class: className }: PricingProps = $props();

    const visiblePlans = plans;

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
            <h2
                class="text-[#fcad42] font-medium leading-[1.1] tracking-tight text-5xl md:text-6xl max-w-2xl text-balance"
            >
                All-in-one infra for solo devs & SMBs<span class="text-white">_</span>
            </h2>

            <p class="text-white text-lg md:text-xl font-medium max-w-2xl leading-relaxed mt-2">
                Honest INR pricing. Free to try — Basic unlocks Studio. Scale when you need seats and
                headroom.
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
            class="grid w-[94%] md:w-[90%] xl:w-full max-w-[1280px] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 bg-[#1a1a1a] overflow-hidden rounded-[24px] border border-white/5 relative shadow-2xl"
        >
            {#each visiblePlans as { id, name, price, tag: label, subtitle, description, event, features, buttonText }, index (`${id},${label},${index}`)}
                {@const isEnterprise = id === 'Enterprise'}
                <div
                    class={cn(
                        'flex flex-col gap-1 px-5 py-8 border-b border-white/5 xl:border-b-0',
                        index !== visiblePlans.length - 1 ? 'xl:border-r xl:border-white/5' : ''
                    )}
                >
                    <div class="flex items-center gap-2.5">
                        <span class="text-white text-lg font-medium tracking-normal leading-none"
                            >{name}</span
                        >
                        {#if label}
                            <span
                                class="bg-accent-200 text-caption rounded-lg px-1.5 py-0.5 font-medium text-white"
                                >{label}</span
                            >
                        {/if}
                    </div>
                    <div class="flex flex-1 flex-col">
                        <span
                            class={cn(
                                'text-[2.5rem] font-medium mt-4 mb-6 flex items-baseline gap-1 tracking-tight font-sans text-[#fcad42]'
                            )}
                        >
                            {price}
                            {#if subtitle}
                                <span class="text-white text-[15px] font-normal">{subtitle}</span>
                            {/if}
                        </span>

                        <p class="text-white text-[13px] mt-1 mb-5 block font-medium leading-snug">
                            {description}
                        </p>

                        {#if features && features.length > 0}
                            <ul class="text-white text-[13px] mt-1 flex flex-col gap-2.5 font-normal mb-8">
                                {#each features as feature}
                                    <li class="flex items-start gap-2.5">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="#fff"
                                            stroke-width="1.5"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            class="h-4 w-4 shrink-0 mt-[1px]"
                                            ><path d="M20 6 9 17l-5-5" /></svg
                                        >
                                        <span class="flex-1 leading-snug tracking-normal"
                                            >{feature}</span
                                        >
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <a
                        href={isEnterprise ? '/contact-us/enterprise' : DASHBOARD_URL}
                        onclick={() => trackEvent(event)}
                        class={cn(
                            'mt-auto flex w-full items-center justify-center rounded-md px-4 py-2.5 text-[14px] font-semibold text-white transition-all',
                            isEnterprise
                                ? 'bg-transparent border border-white/10 hover:bg-white/5'
                                : 'bg-gradient-to-r from-[#fcad42] to-[#fc5d5d] hover:opacity-90'
                        )}
                    >
                        {buttonText}
                    </a>
                </div>
            {/each}
        </div>
    </div>
</div>
