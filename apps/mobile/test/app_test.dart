import "package:control_premium_mobile/main.dart";
import "package:flutter_test/flutter_test.dart";

void main() {
  testWidgets("abre o login oficial", (tester) async {
    await tester.pumpWidget(const ControlPremiumApp());

    expect(find.text("Control\$ Premium"), findsOneWidget);
    expect(find.text("Entrar"), findsOneWidget);
    expect(find.text("E-mail ou telefone"), findsOneWidget);
  });
}
