import "package:flutter/material.dart";

void main() {
  runApp(const ControlPremiumApp());
}

class ControlColors {
  static const background = Color(0xFF0A0A0F);
  static const surface = Color(0xFF12121A);
  static const surface2 = Color(0xFF1A1A2E);
  static const primary = Color(0xFFFFD700);
  static const secondary = Color(0xFF29B6F6);
  static const error = Color(0xFFFF5252);
  static const purple = Color(0xFFB388FF);
  static const grey = Color(0xFF9E9E9E);
}

class ControlPremiumApp extends StatelessWidget {
  const ControlPremiumApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "Control\$ Premium",
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: ControlColors.background,
        colorScheme: const ColorScheme.dark(
          primary: ControlColors.primary,
          secondary: ControlColors.secondary,
          error: ControlColors.error,
          surface: ControlColors.surface,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: ControlColors.surface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0x0FFFFFFF)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0x0FFFFFFF)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: ControlColors.primary),
          ),
        ),
      ),
      home: const LoginScreen(),
    );
  }
}

class PremiumButton extends StatelessWidget {
  const PremiumButton({
    required this.label,
    required this.onPressed,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          foregroundColor: Colors.black,
          backgroundColor: ControlColors.primary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final contactController = TextEditingController();
  final passwordController = TextEditingController();
  bool submitting = false;

  @override
  void dispose() {
    contactController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (contactController.text.trim().isEmpty ||
        passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Informe contato e senha.")),
      );
      return;
    }
    setState(() => submitting = true);
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    setState(() => submitting = false);
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => const DashboardScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 390),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.account_balance_wallet_rounded,
                    size: 64,
                    color: ControlColors.primary,
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    "Control\$ Premium",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: ControlColors.primary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    "Gestão Premium de Crédito",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: ControlColors.grey),
                  ),
                  const SizedBox(height: 36),
                  TextField(
                    controller: contactController,
                    autofillHints: const [
                      AutofillHints.email,
                      AutofillHints.telephoneNumber,
                    ],
                    decoration: const InputDecoration(
                      labelText: "E-mail ou telefone",
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: passwordController,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: const InputDecoration(
                      labelText: "Senha",
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  const SizedBox(height: 24),
                  PremiumButton(
                    label: submitting ? "Entrando..." : "Entrar",
                    onPressed: submitting ? null : submit,
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    "A autenticação real será ativada após conectar o Supabase.",
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: ControlColors.grey),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int selectedIndex = 0;

  static const pages = [
    _DashboardHome(),
    _PlaceholderPage(
      icon: Icons.people_alt_outlined,
      title: "Clientes",
      subtitle: "Cadastro, documentos e análise.",
    ),
    _PlaceholderPage(
      icon: Icons.receipt_long_outlined,
      title: "Empréstimos",
      subtitle: "Parcelas, pagamentos, recibos e PIX.",
    ),
    _PlaceholderPage(
      icon: Icons.settings_outlined,
      title: "Configurações",
      subtitle: "Empresa, equipe, segurança e integrações.",
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: pages[selectedIndex]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        backgroundColor: const Color(0xE612121A),
        indicatorColor: const Color(0x22FFD700),
        onDestinationSelected: (index) =>
            setState(() => selectedIndex = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard, color: ControlColors.primary),
            label: "Início",
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people, color: ControlColors.primary),
            label: "Clientes",
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(
              Icons.receipt_long,
              color: ControlColors.primary,
            ),
            label: "Crédito",
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings, color: ControlColors.primary),
            label: "Ajustes",
          ),
        ],
      ),
    );
  }
}

class _DashboardHome extends StatelessWidget {
  const _DashboardHome();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 24, 18, 18),
      children: [
        const Text(
          "Bem-vindo",
          style: TextStyle(color: ControlColors.grey, fontSize: 13),
        ),
        const Text(
          "Control\$ Premium",
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: ControlColors.primary,
          ),
        ),
        const SizedBox(height: 6),
        const Align(
          alignment: Alignment.centerLeft,
          child: Chip(
            label: Text("Administrador"),
            backgroundColor: Color(0x22B388FF),
            labelStyle: TextStyle(color: ControlColors.purple),
          ),
        ),
        const SizedBox(height: 18),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.35,
          children: const [
            _KpiCard(
              icon: Icons.payments_outlined,
              label: "Recebido",
              value: "R\$ 0,00",
              color: ControlColors.primary,
            ),
            _KpiCard(
              icon: Icons.schedule_outlined,
              label: "Em aberto",
              value: "R\$ 0,00",
              color: ControlColors.secondary,
            ),
            _KpiCard(
              icon: Icons.warning_amber_rounded,
              label: "Vencido",
              value: "R\$ 0,00",
              color: ControlColors.error,
            ),
            _KpiCard(
              icon: Icons.people_outline,
              label: "Clientes",
              value: "0",
              color: ControlColors.purple,
            ),
          ],
        ),
        const SizedBox(height: 20),
        PremiumButton(
          label: "Novo cliente",
          onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                "Conecte o Supabase para ativar cadastros persistentes.",
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: ControlColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0x0FFFFFFF)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color),
            const SizedBox(height: 8),
            Text(
              label.toUpperCase(),
              style: const TextStyle(
                fontSize: 10,
                color: ControlColors.grey,
              ),
            ),
            Text(
              value,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlaceholderPage extends StatelessWidget {
  const _PlaceholderPage({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 58, color: ControlColors.primary),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(color: ControlColors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
