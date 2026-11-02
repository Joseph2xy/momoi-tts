import type { CSSProperties, ReactNode } from 'react';
import {
  AudioLines,
  UsersRound,
  Settings,
  MoreHorizontal,
  WandSparkles,
  Radio,
  CircleHelp,
  RotateCcw,
  Power,
  X,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
  useSidebar,
} from './components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip';

type Page = 'activity' | 'characters' | 'settings' | 'setup';
type Props = {
  page: Page;
  onNavigate: (page: Page) => void;
  onDialog: (dialog: 'diagnostics' | 'restart') => void;
  onExit: () => void;
  needsSetup: boolean;
  playerMessage: string;
  audioConnected: boolean;
  blocked: boolean;
  canQuit: boolean;
  children: ReactNode;
};
const pages = [
  { id: 'activity', label: 'Activity', icon: AudioLines },
  { id: 'characters', label: 'Characters', icon: UsersRound },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

function Navigation(props: Props) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  function navigate(page: Page) {
    props.onNavigate(page);
    setOpenMobile(false);
  }
  return (
    <Sidebar>
      <SidebarHeader className="h-22 shrink-0 flex-row items-center px-4 py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="MomoiTTS home"
              aria-label="MomoiTTS home"
              onClick={() => navigate('activity')}
            >
              <AudioLines aria-hidden="true" />
              {!collapsed ? (
                <span className="flex flex-col gap-0.5">
                  <strong className="text-lg font-semibold tracking-tight">MomoiTTS</strong>
                  <span className="text-xs text-muted-foreground">Stream characters</span>
                </span>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            onClick={() => setOpenMobile(false)}
          >
            <X />
          </Button>
        ) : null}
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup className="px-4 py-6">
          <SidebarMenu aria-label="Main navigation" className="gap-2">
            {pages.map((item) => (
              <SidebarMenuItem key={item.id} className="flex h-12 items-center">
                <SidebarMenuButton
                  isActive={props.page === item.id}
                  tooltip={item.label}
                  aria-label={item.label}
                  aria-current={props.page === item.id ? 'page' : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <item.icon aria-hidden="true" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {props.needsSetup ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={props.page === 'setup'}
                  tooltip="Finish setup"
                  aria-label="Finish setup"
                  onClick={() => navigate('setup')}
                >
                  <WandSparkles />
                  {!collapsed ? <span>Finish setup</span> : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 pb-5">
        <SidebarMenu className="gap-2">
          <SidebarMenuItem className="flex h-12 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip="App options" aria-label="App options">
                  <MoreHorizontal />
                  {!collapsed ? <span>App options</span> : null}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={collapsed ? 'right' : 'top'}
                align="start"
                className="w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => navigate('setup')}>
                    <WandSparkles />
                    Setup guide
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => props.onDialog('diagnostics')}>
                    <CircleHelp />
                    Diagnostics
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={props.blocked}
                    onSelect={() => props.onDialog('restart')}
                  >
                    <RotateCcw />
                    Restart app
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Exit MomoiTTS"
              aria-label="Exit MomoiTTS"
              disabled={props.blocked || !props.canQuit}
              onClick={props.onExit}
            >
              <Power />
              {!collapsed ? <span>Exit MomoiTTS</span> : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavigationToggle() {
  const { isMobile, open, openMobile } = useSidebar();
  const label = isMobile ? 'Open navigation' : open ? 'Collapse navigation' : 'Expand navigation';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger aria-label={label} aria-expanded={isMobile ? openMobile : open} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ManagementShell(props: Props) {
  return (
    <SidebarProvider
      className="h-dvh min-h-0 overflow-hidden"
      style={{ '--sidebar-width': '15rem', '--sidebar-width-icon': '4.5rem' } as CSSProperties}
    >
      <Navigation {...props} />
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-8">
          <NavigationToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={props.audioConnected ? 'success' : 'quiet'}
                role="status"
                tabIndex={0}
              >
                <Radio aria-hidden="true" />
                {props.audioConnected ? 'Audio source connected' : 'Audio source disconnected'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {props.playerMessage} Confirm audibility and recording/stream tracks in OBS
              separately.
            </TooltipContent>
          </Tooltip>
        </header>
        {props.children}
      </SidebarInset>
    </SidebarProvider>
  );
}
